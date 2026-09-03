import type { NextFunction, Request, Response } from 'express';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

export function compressResponse(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'HEAD' || !/\b(?:br|gzip)\b/.test(req.headers['accept-encoding'] ?? '')) return next();
  const end = res.end.bind(res);
  const chunks: Buffer[] = [];
  res.write = ((chunk: any, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback?.();
    return true;
  }) as typeof res.write;
  res.end = ((chunk?: any, encoding?: BufferEncoding, callback?: () => void) => {
    if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    const body = Buffer.concat(chunks);
    const type = String(res.getHeader('Content-Type') ?? '');
    if (!body.length || res.getHeader('Content-Encoding') || res.statusCode === 204 || res.statusCode === 304
      || !/^(?:text\/|application\/(?:json|javascript|xml))/.test(type)) return end(body, callback);
    const br = /\bbr\b/.test(req.headers['accept-encoding'] ?? '');
    const compressed = br
      ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : gzipSync(body);
    res.setHeader('Content-Encoding', br ? 'br' : 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', compressed.length);
    return end(compressed, callback);
  }) as typeof res.end;
  next();
}
