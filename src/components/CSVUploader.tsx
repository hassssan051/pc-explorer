import Papa from "papaparse";

function CSVUploader({
  onData,
}: {
  onData: (data: any[], cols: string[]) => void;
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (res) => {
        const cols = res.meta.fields || [];
        onData(res.data as any[], cols);
      },
    });
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <input
        type="file"
        accept=".csv"
        onChange={handleFile}
        title="Upload your own CSV dataset"
      />
    </div>
  );
}

export default CSVUploader;
