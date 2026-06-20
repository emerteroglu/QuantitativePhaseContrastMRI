declare module 'dicom-parser' {
  export interface DataSet {
    string(tag: string): string | undefined;
    uint16(tag: string, index?: number): number | undefined;
    int16(tag: string, index?: number): number | undefined;
    uint32(tag: string, index?: number): number | undefined;
    int32(tag: string, index?: number): number | undefined;
    float(tag: string, index?: number): number | undefined;
    double(tag: string, index?: number): number | undefined;
    floatString(tag: string): number | undefined;
    intString(tag: string): number | undefined;

    byteArray: Uint8Array;
    elements: {
      [tag: string]: {
        tag: string;
        vr: string;
        length: number;
        dataOffset: number;
      };
    };
  }

  export function parseDicom(
    byteArray: Uint8Array,
    options?: {
      untilTag?: string;
      maxReactionTime?: number;
    }
  ): DataSet;
}
