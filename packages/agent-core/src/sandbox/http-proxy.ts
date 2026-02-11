import type { Socket, Server } from 'node:net'
import type { Duplex } from 'node:stream'
import { Agent, createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect } from 'node:net'
import { URL } from 'node:url'
import { logForDebugging } from './utils/debug.js'

export interface HttpProxyServerOptions {
  filter(
    port: number,
    host: string,
    socket: Socket | Duplex,
  ): Promise<boolean> | boolean

  /**
   * Optional function to get the MITM proxy socket path for a given host.
   * If returns a socket path, the request will be routed through that MITM proxy.
   * If returns undefined, the request will be handled directly.
   */
  getMitmSocketPath?(host: string): string | undefined
}

export function createHttpProxyServer(options: HttpProxyServerOptions): Server {
  const server = createServer()

  // Handle CONNECT requests for HTTPS traffic
  server.on('connect', async (req, socket) => {
    // Attach error handler immediately to prevent unhandled errors
    socket.on('error', err => {
      logForDebugging(`Client socket error: ${err.message}`, { level: 'error' })
    })

    try {
      const [hostname, portStr] = req.url!.split(':')
      const port = portStr === undefined ? undefined : parseInt(portStr, 10)

      if (!hostname || !port) {
        logForDebugging(`Invalid CONNECT request: ${req.url}`, {
          level: 'error',
        })
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        return
      }

      const allowed = await options.filter(port, hostname, socket)
      if (!allowed) {
        logForDebugging(`Connection blocked to ${hostname}:${port}`, {
          level: 'error',
        })
        socket.end(
          'HTTP/1.1 403 Forbidden\r\n' +
            'Content-Type: text/plain\r\n' +
            'X-Proxy-Error: blocked-by-allowlist\r\n' +
            '\r\n' +
            'Connection blocked by network allowlist',
        )
        return
      }

      // Check if this host should be routed through a MITM proxy
      const mitmSocketPath = options.getMitmSocketPath?.(hostname)

      if (mitmSocketPath) {
        // Route through MITM proxy via Unix socket
        logForDebugging(
          `Routing CONNECT ${hostname}:${port} through MITM proxy at ${mitmSocketPath}`,
        )

        const mitmSocket = connect({ path: mitmSocketPath }, () => {
          // Send CONNECT request to the MITM proxy
          mitmSocket.write(
            `CONNECT ${hostname}:${port} HTTP/1.1\r\n` +
              `Host: ${hostname}:${port}\r\n` +
              '\r\n',
          )
        })

        // Buffer to accumulate the MITM proxy's response
        let responseBuffer = ''

        const onMitmData = (chunk: Buffer) => {
          responseBuffer += chunk.toString()

          // Check if we've received the full HTTP response headers
          const headerEndIndex = responseBuffer.indexOf('\r\n\r\n')
          if (headerEndIndex !== -1) {
            // Remove data listener, we're done parsing the response
            mitmSocket.removeListener('data', onMitmData)

            // Check if MITM proxy accepted the connection
            const statusLine = responseBuffer.substring(
              0,
              responseBuffer.indexOf('\r\n'),
            )
            if (statusLine.includes(' 200 ')) {
              // Connection established, now pipe data between client and MITM
              socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

              // If there's any data after the headers, write it to the client
              const remainingData = responseBuffer.substring(headerEndIndex + 4)
              if (remainingData.length > 0) {
                socket.write(remainingData)
              }

              mitmSocket.pipe(socket)
              socket.pipe(mitmSocket)
            } else {
              logForDebugging(`MITM proxy rejected CONNECT: ${statusLine}`, {
                level: 'error',
              })
              socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
              mitmSocket.destroy()
            }
          }
        }

        mitmSocket.on('data', onMitmData)

        mitmSocket.on('error', err => {
          logForDebugging(`MITM proxy connection failed: ${err.message}`, {
            level: 'error',
          })
          socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
        })

        socket.on('error', err => {
          logForDebugging(`Client socket error: ${err.message}`, {
            level: 'error',
          })
          mitmSocket.destroy()
        })

        socket.on('end', () => mitmSocket.end())
        mitmSocket.on('end', () => socket.end())
      } else {
        // Direct connection (original behavior)
        const serverSocket = connect(port, hostname, () => {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          serverSocket.pipe(socket)
          socket.pipe(serverSocket)
        })

        serverSocket.on('error', err => {
          logForDebugging(`CONNECT tunnel failed: ${err.message}`, {
            level: 'error',
          })
          socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
        })

        socket.on('error', err => {
          logForDebugging(`Client socket error: ${err.message}`, {
            level: 'error',
          })
          serverSocket.destroy()
        })

        socket.on('end', () => serverSocket.end())
        serverSocket.on('end', () => socket.end())
      }
    } catch (err) {
      logForDebugging(`Error handling CONNECT: ${err}`, { level: 'error' })
      socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n')
    }
  })

  // Handle regular HTTP requests
  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url!)
      const hostname = url.hostname
      const port = url.port
        ? parseInt(url.port, 10)
        : url.protocol === 'https:'
          ? 443
          : 80

      const allowed = await options.filter(port, hostname, req.socket)
      if (!allowed) {
        logForDebugging(`HTTP request blocked to ${hostname}:${port}`, {
          level: 'error',
        })
        res.writeHead(403, {
          'Content-Type': 'text/plain',
          'X-Proxy-Error': 'blocked-by-allowlist',
        })
        res.end('Connection blocked by network allowlist')
        return
      }

      // Check if this host should be routed through a MITM proxy
      const mitmSocketPath = options.getMitmSocketPath?.(hostname)

      if (mitmSocketPath) {
        // Route through MITM proxy via Unix socket
        // Use an agent that connects via the Unix socket
        logForDebugging(
          `Routing HTTP ${req.method} ${hostname}:${port} through MITM proxy at ${mitmSocketPath}`,
        )

        const mitmAgent = new Agent({
          // @ts-expect-error - socketPath is valid but not in types
          socketPath: mitmSocketPath,
        })

        // Send request to MITM proxy with full URL (proxy-style request)
        const proxyReq = httpRequest(
          {
            agent: mitmAgent,
            // For proxy requests, path should be the full URL
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: url.host,
            },
          },
          proxyRes => {
            res.writeHead(proxyRes.statusCode!, proxyRes.headers)
            proxyRes.pipe(res)
          },
        )

        proxyReq.on('error', err => {
          logForDebugging(`MITM proxy request failed: ${err.message}`, {
            level: 'error',
          })
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' })
            res.end('Bad Gateway')
          }
        })

        req.pipe(proxyReq)
      } else {
        // Direct request (original behavior)
        // Choose http or https module
        const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest

        const proxyReq = requestFn(
          {
            hostname,
            port,
            path: url.pathname + url.search,
            method: req.method,
            headers: {
              ...req.headers,
              host: url.host,
            },
          },
          proxyRes => {
            res.writeHead(proxyRes.statusCode!, proxyRes.headers)
            proxyRes.pipe(res)
          },
        )

        proxyReq.on('error', err => {
          logForDebugging(`Proxy request failed: ${err.message}`, {
            level: 'error',
          })
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' })
            res.end('Bad Gateway')
          }
        })

        req.pipe(proxyReq)
      }
    } catch (err) {
      logForDebugging(`Error handling HTTP request: ${err}`, { level: 'error' })
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  })

  return server
}
