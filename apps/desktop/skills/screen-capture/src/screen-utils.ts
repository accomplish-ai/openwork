import { SIPS_BIN } from './constants';
import { execFileAsync } from './process-utils';

export async function getImageDimensions(
  filePath: string
): Promise<{ width?: number; height?: number }> {
  if (!SIPS_BIN) {
    return {};
  }

  const metadata = await execFileAsync(SIPS_BIN, ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
  const widthMatch = metadata.stdout.match(/pixelWidth:\s*(\d+)/i);
  const heightMatch = metadata.stdout.match(/pixelHeight:\s*(\d+)/i);
  return {
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
  };
}
