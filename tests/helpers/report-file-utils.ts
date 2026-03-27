import assert from 'node:assert/strict';

export const decodePdfHexChunk = (hex: string): string => {
  const bytes = Buffer.from(hex, 'hex');

  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    try {
      const chars: string[] = [];

      for (let index = 0; index < bytes.length; index += 2) {
        const codePoint = bytes.readUInt16BE(index);

        if (codePoint !== 0) {
          chars.push(String.fromCharCode(codePoint));
        }
      }

      const utf16Text = chars.join('');

      if (/[А-Яа-яЁё]/.test(utf16Text)) {
        return utf16Text;
      }
    } catch {
      // fall back to utf8 below
    }
  }

  return bytes.toString('utf8');
};

export const extractPdfText = (buffer: Buffer): string => {
  const source = buffer.toString('latin1');
  const matches = source.match(/<([0-9A-Fa-f]+)>/g) ?? [];

  return matches
    .map((match) => decodePdfHexChunk(match.slice(1, -1)))
    .join(' ');
};

export const normalizePdfText = (value: string): string => value.replace(/\s+/g, '');

export const findZipEntries = (buffer: Buffer) => {
  const entries: Array<{ filename: string; content: Buffer }> = [];
  let offset = 0;

  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const filename = buffer
      .subarray(offset + 30, offset + 30 + filenameLength)
      .toString('utf8');
    const dataStart = offset + 30 + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    assert.equal(compressionMethod, 0);

    entries.push({
      filename,
      content: buffer.subarray(dataStart, dataEnd),
    });

    offset = dataEnd;
  }

  return entries;
};
