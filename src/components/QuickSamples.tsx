function QuickSamples({
  onData,
}: {
  onData: (data: any[], cols: string[]) => void;
}) {
  const sampleData = [
    { country: "China", pop: 1409517397, gdp: 14342903 },
    { country: "India", pop: 1339180127, gdp: 2875142 },
    { country: "USA", pop: 324459463, gdp: 21433226 },
    { country: "Indonesia", pop: 263991379, gdp: 1058398 },
    { country: "Brazil", pop: 209288278, gdp: 1444731 },
  ];
  const cols = ["country", "pop", "gdp"];

  return (
    <button
      onClick={() => onData(sampleData, cols)}
      title="Load a built-in dataset to try the tool"
    >
      Load Sample Data
    </button>
  );
}

export default QuickSamples;
