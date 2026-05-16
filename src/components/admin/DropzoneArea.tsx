import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropzoneAreaProps {
  onFile: (file: File) => void;
  accept?: Record<string, string[]>;
  current?: File | null;
}

const DEFAULT_ACCEPT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
};

export function DropzoneArea({ onFile, accept = DEFAULT_ACCEPT, current }: DropzoneAreaProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    onDrop: (files) => {
      if (files[0]) onFile(files[0]);
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors',
        isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {current ? <FileSpreadsheet className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {current
          ? current.name
          : isDragActive
            ? 'أفلت الملف هنا'
            : 'اسحب وأفلت الملف هنا، أو اضغط للاختيار'}
      </p>
      <p className="mt-1 text-caption">
        {current ? `${(current.size / 1024).toFixed(1)} KB` : '.xlsx · .xls · .csv'}
      </p>
    </div>
  );
}
