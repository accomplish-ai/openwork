/**
 * QRCodeDisplay Component
 *
 * Renders a visual QR code placeholder with the pairing string.
 * In production, this would use a library like 'qrcode.react' to
 * render the actual QR code from the qrString.
 *
 * For now, displays a styled placeholder that shows the pairing flow.
 */

import { useState, useEffect } from 'react';

interface QRCodeDisplayProps {
  qrString: string;
  expiresAt: number;
  onExpired?: () => void;
  size?: number;
}

export function QRCodeDisplay({ qrString, expiresAt, onExpired, size = 200 }: QRCodeDisplayProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !expired) {
        setExpired(true);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, expired, onExpired]);

  // Generate a deterministic pattern from the QR string for visual representation
  const cells = generateQRPattern(qrString, 25);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative rounded-xl border-2 border-border bg-white p-3 shadow-sm"
        style={{ width: size + 24, height: size + 24 }}
      >
        {expired ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="mt-2 text-xs text-muted-foreground">QR expired</p>
              <p className="text-xs text-muted-foreground">Refreshing...</p>
            </div>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${cells.length} ${cells.length}`}
            width={size}
            height={size}
            className="block"
          >
            {cells.map((row, y) =>
              row.map((cell, x) =>
                cell ? (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width={1}
                    height={1}
                    fill="#000000"
                  />
                ) : null
              )
            )}
            {/* Center logo area */}
            <rect
              x={Math.floor(cells.length / 2) - 3}
              y={Math.floor(cells.length / 2) - 3}
              width={7}
              height={7}
              fill="#ffffff"
              rx={1}
            />
            <rect
              x={Math.floor(cells.length / 2) - 2}
              y={Math.floor(cells.length / 2) - 2}
              width={5}
              height={5}
              fill="#25D366"
              rx={1}
            />
          </svg>
        )}
      </div>
      {!expired && (
        <p className="text-xs text-muted-foreground">
          Expires in {timeLeft}s
        </p>
      )}
    </div>
  );
}

/**
 * Generate a simple visual QR-like pattern from a string.
 * This is NOT an actual QR encoder - it creates a visually similar
 * deterministic pattern. In production, use the 'qrcode' npm package.
 */
function generateQRPattern(input: string, size: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  // Position detection patterns (top-left, top-right, bottom-left)
  const drawFinderPattern = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const isOuter = y === 0 || y === 6 || x === 0 || x === 6;
        const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        grid[startY + y][startX + x] = isOuter || isInner;
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(size - 7, 0);
  drawFinderPattern(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Fill data area with pseudo-random pattern based on hash
  let seed = Math.abs(hash);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Skip finder patterns and timing
      if ((x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8)) continue;
      if (x === 6 || y === 6) continue;

      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      grid[y][x] = (seed % 3) !== 0;
    }
  }

  return grid;
}
