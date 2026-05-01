function debugSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Products');
  const data = sheet.getDataRange().getValues();
  Logger.log(JSON.stringify(data.slice(0, 5)));
}
