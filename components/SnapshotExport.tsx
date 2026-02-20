"use client";

import { RefObject, useState } from "react";
import { Camera } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";

interface SnapshotExportProps {
  targetRef: RefObject<HTMLElement>;
  fileName?: string;
}

export function SnapshotExport({ targetRef, fileName = "shock-lab-snapshot" }: SnapshotExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportSnapshot = async () => {
    if (!targetRef.current) {
      setError("No se encontró el contenedor principal para exportar.");
      return;
    }

    setIsExporting(true);
    setError(null);
    try {
      const dataUrl = await toPng(targetRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: 1600,
        height: 900,
        style: {
          width: "1600px",
          height: "900px",
        },
      });

      const link = document.createElement("a");
      link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (captureError) {
      const message =
        captureError instanceof Error
          ? captureError.message
          : "Falló la generación del PNG.";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={exportSnapshot} disabled={isExporting}>
        <Camera className="mr-2 h-4 w-4" />
        {isExporting ? "Exportando..." : "Export Snapshot (PNG)"}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
