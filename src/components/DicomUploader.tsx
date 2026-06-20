import React, { useRef, useState } from 'react';
import { UploadCloud, Database, Trash2, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { parseDicomFile, groupDicomFiles, type ParsedDicomFile } from '../utils/dicomParser';


interface DicomUploaderProps {
  onDataLoaded: (magnitude: ParsedDicomFile[], phase: ParsedDicomFile[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  hasData: boolean;
  onLoadSample: () => void;
  magnitudeFiles: ParsedDicomFile[];
  phaseFiles: ParsedDicomFile[];
  onClear: () => void;
}

export const DicomUploader: React.FC<DicomUploaderProps> = ({
  onDataLoaded,
  isLoading,
  setIsLoading,
  hasData,
  onLoadSample,
  magnitudeFiles,
  phaseFiles,
  onClear
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  // Helper to recursively walk a directory and extract all File objects
  const traverseDirectory = async (entry: any): Promise<File[]> => {
    const files: File[] = [];
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      files.push(file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readEntries = async (): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
      };
      
      let entries = await readEntries();
      const allEntries = [...entries];
      // readEntries is paginated; loop until we get everything
      while (entries.length > 0) {
        entries = await readEntries();
        allEntries.push(...entries);
      }

      for (const childEntry of allEntries) {
        const childFiles = await traverseDirectory(childEntry);
        files.push(...childFiles);
      }
    }
    return files;
  };

  const processFiles = async (files: File[] | FileList) => {
    setIsLoading(true);
    setErrorMsg(null);
    const parsedFiles: ParsedDicomFile[] = [];
    const errors: { name: string; message: string }[] = [];

    const filesArray = Array.from(files);

    // Filter out files that are definitely too small to be DICOM (preamble is 128 bytes, prefix 4 bytes = 132 bytes minimum)
    const validFiles = filesArray.filter(f => f.size >= 132);

    if (validFiles.length === 0) {
      setErrorMsg("No valid DICOM files (larger than 132 bytes) were detected.");
      setIsLoading(false);
      return;
    }

    const filePromises = validFiles.map(async (file) => {
      try {
        const buffer = await file.arrayBuffer();
        const parsedArray = parseDicomFile(buffer, file.name);
        parsedFiles.push(...parsedArray);
      } catch (err: any) {
        console.error(`Error parsing ${file.name}:`, err);
        errors.push({ name: file.name, message: err?.message || String(err) });
      }
    });

    await Promise.all(filePromises);

    if (parsedFiles.length === 0) {
      const details = errors.length > 0 ? `: ${errors[0].name} (${errors[0].message})` : "";
      setErrorMsg(`Failed to parse any valid DICOM files. Ensure they are uncompressed and valid DICOM formats.${details}`);
      setIsLoading(false);
      return;
    }

    // Group files
    const grouped = groupDicomFiles(parsedFiles);

    if (grouped.magnitude.length === 0 || grouped.phase.length === 0) {
      if (grouped.magnitude.length > 0) {
        onDataLoaded(grouped.magnitude, []);
        setErrorMsg("Loaded Magnitude series, but could not identify a paired Phase contrast series. Please upload both series together.");
      } else if (grouped.phase.length > 0) {
        onDataLoaded([], grouped.phase);
        setErrorMsg("Loaded Phase series, but could not identify a paired Magnitude anatomy series.");
      } else {
        setErrorMsg("Could not group files into paired Magnitude/Phase series. Check file tags.");
      }
    } else {
      onDataLoaded(grouped.magnitude, grouped.phase);
    }

    setIsLoading(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const allFiles: File[] = [];
      const promises: Promise<File[]>[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            promises.push(traverseDirectory(entry));
          }
        }
      }

      const fileGroups = await Promise.all(promises);
      fileGroups.forEach(group => allFiles.push(...group));

      if (allFiles.length > 0) {
        await processFiles(allFiles);
        return;
      }
    }

    // Fallback if webkitGetAsEntry is not supported
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="sidebar-section">
      <h3>
        <Database size={16} /> Data Acquisition
      </h3>

      {!hasData ? (
        <div className="flex flex-col gap-4">
          <div
            className={`dropzone ${isDragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept="*"
            />
            <UploadCloud size={32} className="dropzone-icon" />
            <div>
              <p className="font-semibold">Drag & Drop DICOM files</p>
              <p className="text-xs">or click to browse local files</p>
            </div>
            <span>Supports folder uploads & multiple files</span>
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className="btn btn-accent w-full" onClick={onLoadSample} disabled={isLoading}>
              <Database size={16} /> Load Demo Aqueduct Scan
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="info-banner" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)', color: '#a7f3d0' }}>
            <CheckCircle2 size={16} className="info-banner-icon" style={{ color: '#10b981' }} />
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>Dataset Loaded Successfully</div>
              <div style={{ fontSize: '0.75rem', opacity: '0.9' }}>
                {magnitudeFiles[0]?.isSynthetic ? 'Demo Simulation Data' : 'Patient DICOM Series'}
              </div>
            </div>
          </div>

          <div className="file-list-summary" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span>Magnitude Series:</span>
              <span className="font-mono text-primary">{magnitudeFiles.length} frames</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Phase Flow Series:</span>
              <span className="font-mono text-primary">{phaseFiles.length} frames</span>
            </div>
          </div>

          <div className="file-list">
            {magnitudeFiles.length > 0 && (
              <div className="file-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={12} />
                  <span className="file-item-name">{magnitudeFiles[0].seriesDescription}</span>
                </div>
                <span className="file-item-badge magnitude">MAG</span>
              </div>
            )}
            {phaseFiles.length > 0 && (
              <div className="file-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={12} />
                  <span className="file-item-name">{phaseFiles[0].seriesDescription}</span>
                </div>
                <span className="file-item-badge phase">PHASE</span>
              </div>
            )}
          </div>

          <button className="btn btn-danger w-full" style={{ marginTop: '1rem' }} onClick={onClear}>
            <Trash2 size={16} /> Eject Series Data
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="info-banner" style={{ marginTop: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
          <AlertTriangle size={16} className="info-banner-icon" style={{ color: '#ef4444' }} />
          <div style={{ fontSize: '0.75rem' }}>{errorMsg}</div>
        </div>
      )}
    </div>
  );
};
