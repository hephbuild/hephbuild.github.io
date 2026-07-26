/**
 * int8 quantisation for the shipped embeddings.
 *
 * A 384-dim float32 vector is 1536 bytes; as JSON numbers it is far worse. We
 * map each vector onto 0-255 between its own min/max and base64 the bytes, so a
 * vector costs ~512 characters instead of ~7 000. The round-trip error is well
 * under the gap between neighbouring search results, so ranking is unchanged.
 *
 * Both halves live here because the encoder runs at build time (Node) and the
 * decoder in the browser — `btoa`/`atob` are global in both.
 */

/** A quantised embedding as it appears in the shipped index. */
export interface QuantizedVector {
  /** base64 of the 0-255 byte array, one byte per dimension. */
  v: string;
  /** Value the byte 0 maps back to. */
  min: number;
  /** Value the byte 255 maps back to. */
  max: number;
}

export function quantize(values: ArrayLike<number>): QuantizedVector {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const span = max - min || 1;
  let binary = '';
  for (let i = 0; i < values.length; i += 1) {
    binary += String.fromCharCode(Math.round((((values[i] ?? 0) - min) / span) * 255));
  }

  return { v: btoa(binary), min, max };
}

export function dequantize({ v, min, max }: QuantizedVector): number[] {
  const binary = atob(v);
  const span = max - min;
  const values = new Array<number>(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    values[i] = min + (binary.charCodeAt(i) / 255) * span;
  }
  return values;
}
