// A bounded Sheets API double. It preserves remote state after a lost response.
type Sheet = { properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } }; protectedRanges: { description: string }[]; rows: Map<number, string[]> };
type Request = { addSheet?: { properties: Sheet['properties'] }; addProtectedRange?: { protectedRange: { range: { sheetId: number }; description: string } };
  updateSheetProperties?: { properties: { sheetId: number; gridProperties: { rowCount: number } } };
  updateCells?: { range: { sheetId: number; startRowIndex: number }; rows: { values: { userEnteredValue?: { stringValue: string } }[] }[] } };
export class FakeGoogleSheets {
  sheets = new Map<number, Sheet>();
  unavailable = false;
  loseNextResponse = false;
  writes = 0;
  sheet(title: string) { return [...this.sheets.values()].find(sheet => sheet.properties.title === title)!; }
  call = async (path: string, body?: unknown): Promise<unknown> => {
    if (this.unavailable) throw new Error('Fake Google unavailable');
    if (path.startsWith('?')) return { sheets: [...this.sheets.values()].map(({ properties, protectedRanges }) => ({ properties, protectedRanges })) };
    if (path.startsWith('/values:batchGet?')) {
      const ranges = new URL('https://sheets.test' + path).searchParams.getAll('ranges');
      return { valueRanges: ranges.map(range => {
        const [, title, start, end] = /^'(.+)'!A(\d+):[A-Z]+(\d+)$/.exec(range)!;
        const sheet = this.sheet(title!);
        return { values: Array.from({ length: Number(end) - Number(start) + 1 }, (_, i) => sheet.rows.get(Number(start) + i) ?? []) };
      }) };
    }
    if (path !== ':batchUpdate') throw new Error('Unexpected fake request');
    const next = structuredClone(this.sheets);
    for (const request of (body as { requests: Request[] }).requests) {
      if (request.addSheet) {
        const properties = request.addSheet.properties;
        if (next.has(properties.sheetId)) throw new Error('Duplicate sheet');
        next.set(properties.sheetId, { properties, protectedRanges: [], rows: new Map() });
      }
      if (request.addProtectedRange) {
        const range = request.addProtectedRange.protectedRange;
        next.get(range.range.sheetId)!.protectedRanges.push({ description: range.description });
      }
      if (request.updateSheetProperties) {
        const properties = request.updateSheetProperties.properties;
        next.get(properties.sheetId)!.properties.gridProperties.rowCount = properties.gridProperties.rowCount;
      }
      if (request.updateCells) {
        const { range, rows } = request.updateCells;
        next.get(range.sheetId)!.rows.set(range.startRowIndex + 1, rows[0]!.values.map(cell => cell.userEnteredValue?.stringValue ?? ''));
      }
    }
    this.sheets = next; this.writes++;
    if (this.loseNextResponse) { this.loseNextResponse = false; throw new Error('Fake response lost after commit'); }
    return {};
  };
}
