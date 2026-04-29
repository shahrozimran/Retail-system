const PRODUCTS_SHEET = 'Products';
const TRANSACTIONS_SHEET = 'Transactions';
const FINANCES_SHEET = 'Finances';
const SPREADSHEET_ID = ''; // OPTIONAL: Put your Spreadsheet ID here if you want to target a specific sheet

function getSS() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== '') {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.error("Could not open spreadsheet by ID, falling back to active one.");
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Automatically creates or updates the sheet headers to match the system requirements.
 * Run this function from the Apps Script editor to fix "unnamed" columns.
 */
function setupDatabase() {
  const ss = getSS();
  
  // 1. Products Sheet
  const productHeaders = ['UUID', 'SKU', 'Name', 'Category', 'Buy_Price', 'Sale_Price', 'Quantity', 'Min_Stock', 'Status'];
  let productsSheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!productsSheet) {
    productsSheet = ss.insertSheet(PRODUCTS_SHEET);
    productsSheet.appendRow(productHeaders);
    productsSheet.getRange(1, 1, 1, productHeaders.length).setFontWeight('bold').setBackground('#f3f3f3');
    productsSheet.setFrozenRows(1);
  } else {
    // Update headers if they don't match
    productsSheet.getRange(1, 1, 1, productHeaders.length).setValues([productHeaders]);
  }

  // 2. Transactions Sheet
  const transHeaders = ['ID', 'Date', 'Product_UUID', 'Type', 'Qty_Change', 'Unit_Price', 'Total', 'Description', 'Buyer_Name', 'Batch_ID'];
  let transactionsSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  if (!transactionsSheet) {
    transactionsSheet = ss.insertSheet(TRANSACTIONS_SHEET);
    transactionsSheet.appendRow(transHeaders);
    transactionsSheet.getRange(1, 1, 1, transHeaders.length).setFontWeight('bold').setBackground('#f3f3f3');
    transactionsSheet.setFrozenRows(1);
  } else {
    // Force update headers to resolve "unnamed" columns
    transactionsSheet.getRange(1, 1, 1, transHeaders.length).setValues([transHeaders]);
  }

  // 3. Finances Sheet
  const financeHeaders = ['Date', 'Category', 'Debit', 'Credit', 'Balance_Snapshot'];
  let financesSheet = ss.getSheetByName(FINANCES_SHEET);
  if (!financesSheet) {
    financesSheet = ss.insertSheet(FINANCES_SHEET);
    financesSheet.appendRow(financeHeaders);
    financesSheet.getRange(1, 1, 1, financeHeaders.length).setFontWeight('bold').setBackground('#f3f3f3');
    financesSheet.setFrozenRows(1);
  } else {
    financesSheet.getRange(1, 1, 1, financeHeaders.length).setValues([financeHeaders]);
  }

  console.log("Database setup/repair complete. Headers updated.");
}

// Helper to create JSON response with CORS headers
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Handle GET requests (e.g. fetch dashboard data)
function doGet(e) {
  try {
    const action = e.parameter.action || 'dashboard';
    
    // Check Cache First
    const cache = CacheService.getScriptCache();
    const cacheKey = 'UMS_CACHE_' + action;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return createJsonResponse({ success: true, data: JSON.parse(cachedData), cached: true });
    }
    
    let data;
    if (action === 'transactions') {
      data = getTransactionsData();
    } else if (action === 'reports') {
      data = getFinancesData();
    } else {
      data = getDashboardData();
    }
    
    // Store in cache for 5 minutes (300 seconds)
    try {
      cache.put(cacheKey, JSON.stringify(data), 300);
    } catch(err) {
      // payload might be too large, ignore
    }
    
    return createJsonResponse({ success: true, data: data, cached: false });
  } catch (error) {
    return createJsonResponse({ success: false, message: error.message });
  }
}

// Handle POST requests (e.g. process transaction)
function doPost(e) {
  try {
    // Parse the incoming JSON payload from Next.js
    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      throw new Error("No payload provided.");
    }
    
    let result;
    const action = payload.action || 'transaction';
    
    if (action === 'add_product') {
      result = addProduct(payload);
    } else if (action === 'update_product') {
      result = updateProduct(payload);
    } else if (action === 'delete_product') {
      result = deleteProduct(payload);
    } else if (action === 'update_transaction') {
      result = updateTransaction(payload);
    } else if (action === 'delete_transaction') {
      result = deleteTransaction(payload);
    } else if (action === 'batch_transaction') {
      result = processBatchTransaction(payload);
    } else {
      result = processTransaction(payload);
    }
    
    // Invalidate Cache after successful update
    if (result.success) {
      const cache = CacheService.getScriptCache();
      cache.removeAll(['UMS_CACHE_dashboard', 'UMS_CACHE_transactions', 'UMS_CACHE_reports']);
    }
    
    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ success: false, message: error.message });
  }
}

function processTransaction(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    const tSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
    const fSheet = ss.getSheetByName(FINANCES_SHEET);

    const pData = pSheet.getDataRange().getValues();
    let productRowIndex = -1;
    let currentQty = 0;
    
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][0] === data.productUuid) {
        productRowIndex = i + 1; 
        currentQty = Number(pData[i][6]);
        break;
      }
    }

    if (productRowIndex === -1) {
      throw new Error("Product not found.");
    }

    const qtyChange = Number(data.qtyChange);
    const type = data.type;
    const totalAmount = qtyChange * Number(data.unitPrice);

    if (type === 'Out' && currentQty < qtyChange) {
      throw new Error(`Insufficient stock. Available: ${currentQty}`);
    }

    const newQty = type === 'Out' ? currentQty - qtyChange : currentQty + qtyChange;
    pSheet.getRange(productRowIndex, 7).setValue(newQty);
    
    const minStock = Number(pData[productRowIndex - 1][7]);
    let newStatus = 'Active';
    if (newQty <= 0) newStatus = 'Out of Stock';
    else if (newQty <= minStock) newStatus = 'Low Stock';
    pSheet.getRange(productRowIndex, 9).setValue(newStatus);

    const timestamp = new Date();
    const transactionId = Utilities.getUuid();
    
    // Columns: 1:ID, 2:Date, 3:Product_UUID, 4:Type, 5:Qty_Change, 6:Unit_Price, 7:Total, 8:Description, 9:Buyer_Name, 10:Batch_ID
    tSheet.appendRow([
      transactionId, 
      timestamp, 
      data.productUuid, 
      type, 
      qtyChange, 
      data.unitPrice, 
      totalAmount, 
      data.description,
      data.buyerName || '',
      transactionId  // batchId = own ID for single-item transactions
    ]);

    const fData = fSheet.getDataRange().getValues();
    let currentBalance = 0;
    if (fData && fData.length > 1) {
       currentBalance = Number(fData[fData.length - 1][4] || 0);
    }

    let debit = 0;
    let credit = 0;
    
    if (type === 'Out') {
      credit = totalAmount;
      currentBalance += credit;
    } else {
      debit = totalAmount;
      currentBalance -= debit;
    }

    fSheet.appendRow([
      timestamp, 
      type === 'Out' ? 'Sales' : 'Expenses', 
      debit, 
      credit, 
      currentBalance
    ]);

    return { success: true, message: "Transaction processed successfully." };

  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function getDashboardData() {
  const ss = getSS();
  const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
  const pData = pSheet.getDataRange().getValues();
  
  if (pData.length <= 1) {
    return {
      products: [],
      totalInventoryValue: 0,
      totalBalance: 0,
      activeAlerts: 0
    };
  }

  const products = [];
  let totalInventoryValue = 0;
  let activeAlerts = 0;

  for (let i = 1; i < pData.length; i++) {
    const row = pData[i];
    const product = {
      uuid: row[0],
      sku: row[1],
      name: row[2],
      category: row[3],
      buyPrice: Number(row[4]),
      salePrice: Number(row[5]),
      quantity: Number(row[6]),
      minStock: Number(row[7]),
      status: row[8]
    };
    products.push(product);
    totalInventoryValue += (product.quantity * product.buyPrice);
    
    if (product.quantity <= product.minStock) {
      activeAlerts++;
    }
  }

  const fSheet = ss.getSheetByName(FINANCES_SHEET);
  const fData = fSheet.getDataRange().getValues();
  let totalBalance = 0;
  if (fData && fData.length > 1) {
     totalBalance = Number(fData[fData.length - 1][4] || 0);
  }

  return {
    products: products,
    totalInventoryValue: totalInventoryValue,
    totalBalance: totalBalance,
    activeAlerts: activeAlerts
  };
}

function getTransactionsData() {
  const ss = getSS();
  const tSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
  
  const tData = tSheet.getDataRange().getValues();
  const pData = pSheet.getDataRange().getValues();
  
  if (tData.length <= 1) return [];

  // Create product map for quick lookup
  const productMap = {};
  for (let i = 1; i < pData.length; i++) {
    productMap[pData[i][0]] = {
      name: pData[i][2],
      sku: pData[i][1]
    };
  }

  const transactions = [];
  for (let i = 1; i < tData.length; i++) {
    const row = tData[i];
    const productInfo = productMap[row[2]] || { name: 'Unknown', sku: 'N/A' };
    
    transactions.push({
      id: row[0],
      date: row[1],
      productUuid: row[2],
      productName: productInfo.name,
      productSku: productInfo.sku,
      type: row[3],
      qtyChange: Number(row[4]),
      unitPrice: Number(row[5]),
      total: Number(row[6]),
      description: row[7],
      buyerName: row[8] || '',
      batchId: row[9] || row[0]  // fallback to own ID for single-item transactions
    });
  }
  
  return transactions.reverse(); // Newest first
}

function getFinancesData() {
  const ss = getSS();
  const fSheet = ss.getSheetByName(FINANCES_SHEET);
  const fData = fSheet.getDataRange().getValues();
  
  if (fData.length <= 1) return [];

  const finances = [];
  for (let i = 1; i < fData.length; i++) {
    const row = fData[i];
    finances.push({
      date: row[0],
      category: row[1],
      debit: Number(row[2]),
      credit: Number(row[3]),
      balanceSnapshot: Number(row[4])
    });
  }
  
  return finances.reverse(); // Newest first
}

function addProduct(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    
    const uuid = Utilities.getUuid();
    const minStock = Number(data.minStock) || 10;
    const qty = Number(data.quantity) || 0;
    
    let status = 'Active';
    if (qty <= 0) status = 'Out of Stock';
    else if (qty <= minStock) status = 'Low Stock';

    pSheet.appendRow([
      uuid,
      data.sku,
      data.name,
      data.category,
      Number(data.buyPrice),
      Number(data.salePrice),
      qty,
      minStock,
      status
    ]);

    return { success: true, message: "Product added successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updateProduct(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    const pData = pSheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][0] === data.productUuid) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Product not found.");
    }

    // Do not update quantity here, only through transactions
    const minStock = Number(data.minStock) || 10;
    const qty = Number(pData[rowIndex - 1][6]);
    
    let status = 'Active';
    if (qty <= 0) status = 'Out of Stock';
    else if (qty <= minStock) status = 'Low Stock';

    // Columns: 1:UUID, 2:SKU, 3:Name, 4:Category, 5:Buy, 6:Sale, 7:Qty, 8:MinStock, 9:Status
    pSheet.getRange(rowIndex, 2).setValue(data.sku);
    pSheet.getRange(rowIndex, 3).setValue(data.name);
    pSheet.getRange(rowIndex, 4).setValue(data.category);
    pSheet.getRange(rowIndex, 5).setValue(Number(data.buyPrice));
    pSheet.getRange(rowIndex, 6).setValue(Number(data.salePrice));
    pSheet.getRange(rowIndex, 8).setValue(minStock);
    pSheet.getRange(rowIndex, 9).setValue(status);

    return { success: true, message: "Product updated successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deleteProduct(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    const pData = pSheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][0] === data.productUuid) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Product not found.");
    }

    pSheet.deleteRow(rowIndex);

    return { success: true, message: "Product deleted successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updateTransaction(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const tSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
    const tData = tSheet.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 1; i < tData.length; i++) {
      if (tData[i][0] === data.transactionId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Transaction not found.");
    }

    // Columns: 1:ID, 2:Date, 3:Product_UUID, 4:Type, 5:Qty_Change, 6:Unit_Price, 7:Total, 8:Description, 9:Buyer_Name, 10:Batch_ID
    const qtyChange = Number(data.qtyChange);
    const unitPrice = Number(data.unitPrice);
    const total = qtyChange * unitPrice;

    tSheet.getRange(rowIndex, 5).setValue(qtyChange);
    tSheet.getRange(rowIndex, 6).setValue(unitPrice);
    tSheet.getRange(rowIndex, 7).setValue(total);
    tSheet.getRange(rowIndex, 8).setValue(data.description || '');
    tSheet.getRange(rowIndex, 9).setValue(data.buyerName || '');
    // Note: Batch_ID (col 10) is usually not changed during a single-item update.

    return { success: true, message: "Transaction updated successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS();
    const tSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
    const tData = tSheet.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 1; i < tData.length; i++) {
      if (tData[i][0] === data.transactionId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Transaction not found.");
    }

    tSheet.deleteRow(rowIndex);
    return { success: true, message: "Transaction deleted successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Processes a batch of line items (multiple products) in one transaction call.
function processBatchTransaction(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const items = payload.items;
    if (!items || items.length === 0) {
      throw new Error("No items provided in batch.");
    }

    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    const tSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
    const fSheet = ss.getSheetByName(FINANCES_SHEET);

    const pData = pSheet.getDataRange().getValues();

    // Build product map: uuid -> { rowIndex (1-based), currentQty, minStock }
    const productMap = {};
    for (let i = 1; i < pData.length; i++) {
      productMap[pData[i][0]] = {
        rowIndex: i + 1,
        currentQty: Number(pData[i][6]),
        minStock: Number(pData[i][7])
      };
    }

    // Validate all items first before writing anything
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const prod = productMap[item.productUuid];
      if (!prod) {
        throw new Error("Product not found for item #" + (idx + 1) + ".");
      }
      if (item.type === 'Out' && prod.currentQty < Number(item.qtyChange)) {
        throw new Error("Insufficient stock for item #" + (idx + 1) + ". Available: " + prod.currentQty);
      }
    }

    const timestamp = new Date();
    const batchId = Utilities.getUuid();  // Shared ID for all items in this submission
    const fData = fSheet.getDataRange().getValues();
    let currentBalance = 0;
    if (fData && fData.length > 1) {
      currentBalance = Number(fData[fData.length - 1][4] || 0);
    }

    // Process each item
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const prod = productMap[item.productUuid];
      const qtyChange = Number(item.qtyChange);
      const unitPrice = Number(item.unitPrice);
      const totalAmount = qtyChange * unitPrice;
      const type = item.type;

      // Update stock quantity
      const newQty = type === 'Out' ? prod.currentQty - qtyChange : prod.currentQty + qtyChange;
      pSheet.getRange(prod.rowIndex, 7).setValue(newQty);

      // Update status
      let newStatus = 'Active';
      if (newQty <= 0) newStatus = 'Out of Stock';
      else if (newQty <= prod.minStock) newStatus = 'Low Stock';
      pSheet.getRange(prod.rowIndex, 9).setValue(newStatus);

      // Update in-memory map so subsequent items use updated qty
      productMap[item.productUuid].currentQty = newQty;

      // Append transaction row (all items share the same batchId)
      tSheet.appendRow([
        Utilities.getUuid(),
        timestamp,
        item.productUuid,
        type,
        qtyChange,
        unitPrice,
        totalAmount,
        payload.description || '',
        payload.buyerName || '',
        batchId
      ]);

      // Update finances
      let debit = 0;
      let credit = 0;
      if (type === 'Out') {
        credit = totalAmount;
        currentBalance += credit;
      } else {
        debit = totalAmount;
        currentBalance -= debit;
      }

      fSheet.appendRow([
        timestamp,
        type === 'Out' ? 'Sales' : 'Expenses',
        debit,
        credit,
        currentBalance
      ]);
    }

    return { success: true, message: "Batch of " + items.length + " item(s) processed successfully." };

  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}
