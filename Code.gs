const PRODUCTS_SHEET = 'Products';
const TRANSACTIONS_SHEET = 'Transactions';
const FINANCES_SHEET = 'Finances';
const PRODUCTIONS_SHEET = 'Productions';
const CUSTOMERS_SHEET = 'Customers';
const CUSTOMER_LEDGER_SHEET = 'CustomerLedger';
const SPREADSHEET_ID = ''; 

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

function getColumnIndex(headers, colName) {
  const lowerName = colName.toLowerCase();
  const index = headers.findIndex(h => h.toString().toLowerCase() === lowerName);
  if (index === -1) throw new Error("Column '" + colName + "' not found in headers. Please run setupDatabase() or rename columns manually.");
  return index;
}

/**
 * Automatically creates or updates the sheet headers to match the system requirements.
 * Run this function from the Apps Script editor to fix "unnamed" columns.
 */
function setupDatabase() {
  const ss = getSS();
  
  // 1. Products Sheet
  const productHeaders = ['UUID', 'SKU', 'Name', 'Category', 'Buy_Price', 'Sale_Price', 'Quantity', 'Min_Stock', 'Status', 'Raw_Materials'];
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

  // 4. Productions Sheet
  const prodHeaders = ['ID', 'Date', 'Product_UUID', 'Product_Name', 'Qty_Produced', 'Raw_Materials_Used_JSON', 'Cost_Per_Unit', 'Sale_Per_Unit'];
  let productionsSheet = ss.getSheetByName(PRODUCTIONS_SHEET);
  if (!productionsSheet) {
    productionsSheet = ss.insertSheet(PRODUCTIONS_SHEET);
    productionsSheet.appendRow(prodHeaders);
    productionsSheet.getRange(1, 1, 1, prodHeaders.length).setFontWeight('bold').setBackground('#f3f3f3');
    productionsSheet.setFrozenRows(1);
  } else {
    productionsSheet.getRange(1, 1, 1, prodHeaders.length).setValues([prodHeaders]);
  }

  // 5. Customer Ledger
  if (!ss.getSheetByName(CUSTOMERS_SHEET)) {
    ss.insertSheet(CUSTOMERS_SHEET);
    ss.getSheetByName(CUSTOMERS_SHEET).appendRow(['UUID', 'Name', 'Phone', 'Email', 'Current_Balance', 'Status']);
  }
  if (!ss.getSheetByName(CUSTOMER_LEDGER_SHEET)) {
    ss.insertSheet(CUSTOMER_LEDGER_SHEET);
    ss.getSheetByName(CUSTOMER_LEDGER_SHEET).appendRow(['ID', 'Date', 'Customer_UUID', 'Type', 'Amount', 'Description', 'Balance_Snapshot']);
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
    } else if (action === 'productions') {
      data = getProductionsData();
    } else if (action === 'customers') {
      data = getCustomersData();
    } else if (action === 'customer_ledger') {
      data = getCustomerLedger(e.parameter.customerUuid);
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
    
    // Invalidate Cache for all mutations
    const cache = CacheService.getScriptCache();
    cache.removeAll(['UMS_CACHE_dashboard', 'UMS_CACHE_transactions', 'UMS_CACHE_reports', 'UMS_CACHE_productions', 'UMS_CACHE_customers', 'UMS_CACHE_customer_ledger']);
    
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
    } else if (action === 'process_production') {
      result = processProduction(payload);
    } else if (action === 'add_customer') {
      result = addCustomer(payload);
    } else if (action === 'record_customer_payment') {
      result = recordCustomerPayment(payload);
    } else if (action === 'delete_customer') {
      result = deleteCustomer(payload);
    } else {
      result = processTransaction(payload);
    }
    
    // Invalidate Cache after successful update
    if (result.success) {
      const cache = CacheService.getScriptCache();
      cache.removeAll(['UMS_CACHE_dashboard', 'UMS_CACHE_transactions', 'UMS_CACHE_reports', 'UMS_CACHE_productions']);
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
    const headers = pData[0];
    const uuidIdx = getColumnIndex(headers, 'UUID');
    const qtyIdx = getColumnIndex(headers, 'Quantity');
    const minStockIdx = getColumnIndex(headers, 'Min_Stock');
    const statusIdx = getColumnIndex(headers, 'Status');

    let productRowIndex = -1;
    let currentQty = 0;
    
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][uuidIdx] === data.productUuid) {
        productRowIndex = i + 1; 
        currentQty = Number(pData[i][qtyIdx] || 0);
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
    pSheet.getRange(productRowIndex, qtyIdx + 1).setValue(newQty);
    
    const minStock = Number(pData[productRowIndex - 1][minStockIdx]);
    let newStatus = 'Active';
    if (newQty <= 0) newStatus = 'Out of Stock';
    else if (newQty <= minStock) newStatus = 'Low Stock';
    pSheet.getRange(productRowIndex, statusIdx + 1).setValue(newStatus);

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
  const headers = pData[0];

  const uuidIdx = getColumnIndex(headers, 'UUID');
  const skuIdx = getColumnIndex(headers, 'SKU');
  const nameIdx = getColumnIndex(headers, 'Name');
  const catIdx = getColumnIndex(headers, 'Category');
  const buyIdx = getColumnIndex(headers, 'Buy_Price');
  const saleIdx = getColumnIndex(headers, 'Sale_Price');
  const qtyIdx = getColumnIndex(headers, 'Quantity');
  const minStockIdx = getColumnIndex(headers, 'Min_Stock');
  const statusIdx = getColumnIndex(headers, 'Status');
  const rawIdx = getColumnIndex(headers, 'Raw_Materials');
  
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
    const rawMaterials = row[rawIdx] ? JSON.parse(row[rawIdx]) : [];
    const actualQty = Number(row[qtyIdx] || 0);
    
    let potentialQty = 0;
    if (rawMaterials && rawMaterials.length > 0) {
      let minPossible = Infinity;
      rawMaterials.forEach(rm => {
        if (rm.requiredPerProduct > 0) {
          const possible = Math.floor(rm.quantity / rm.requiredPerProduct);
          if (possible < minPossible) minPossible = possible;
        }
      });
      potentialQty = minPossible === Infinity ? 0 : minPossible;
    }

    const minStock = Number(row[minStockIdx]);
    let currentStatus = row[statusIdx];
    
    // Auto-calculate status if it's one of the standard stock statuses
    if (['Active', 'Low Stock', 'Out of Stock'].includes(currentStatus)) {
      if (actualQty <= 0) currentStatus = 'Out of Stock';
      else if (actualQty <= minStock) currentStatus = 'Low Stock';
      else currentStatus = 'Active';
    }

    const product = {
      uuid: row[uuidIdx],
      sku: row[skuIdx],
      name: row[nameIdx],
      category: row[catIdx],
      buyPrice: Number(row[buyIdx]),
      salePrice: Number(row[saleIdx]),
      quantity: actualQty,
      potentialQuantity: potentialQty,
      minStock: minStock,
      status: currentStatus,
      rawMaterials: rawMaterials
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
    
    let status = data.status || 'Active';
    if (status === 'Active' || status === 'Low Stock' || status === 'Out of Stock') {
       if (qty <= 0) status = 'Out of Stock';
       else if (qty <= minStock) status = 'Low Stock';
       else status = 'Active';
    }

    pSheet.appendRow([
      uuid,
      data.sku,
      data.name,
      data.category,
      Number(data.buyPrice),
      Number(data.salePrice),
      qty,
      minStock,
      status,
      JSON.stringify(data.rawMaterials || [])
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
    
    let status = data.status || pData[rowIndex - 1][8];
    if (['Active', 'Low Stock', 'Out of Stock'].includes(status)) {
       if (qty <= 0) status = 'Out of Stock';
       else if (qty <= minStock) status = 'Low Stock';
       else status = 'Active';
    }

    // Columns: 1:UUID, 2:SKU, 3:Name, 4:Category, 5:Buy, 6:Sale, 7:Qty, 8:MinStock, 9:Status
    pSheet.getRange(rowIndex, 2).setValue(data.sku);
    pSheet.getRange(rowIndex, 3).setValue(data.name);
    pSheet.getRange(rowIndex, 4).setValue(data.category);
    pSheet.getRange(rowIndex, 5).setValue(Number(data.buyPrice));
    pSheet.getRange(rowIndex, 6).setValue(Number(data.salePrice));
    pSheet.getRange(rowIndex, 8).setValue(minStock);
    pSheet.getRange(rowIndex, 9).setValue(status);
    pSheet.getRange(rowIndex, 10).setValue(JSON.stringify(data.rawMaterials || []));

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
    const oldType = tData[rowIndex - 1][3];
    const oldQty = Number(tData[rowIndex - 1][4]);
    const productUuid = tData[rowIndex - 1][2];

    const qtyChange = Number(data.qtyChange);
    const unitPrice = Number(data.unitPrice);
    const total = qtyChange * unitPrice;
    const newType = data.type || oldType;

    // 1. Update Product Stock
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    const pData = pSheet.getDataRange().getValues();
    const pHeaders = pData[0];
    const pUuidIdx = getColumnIndex(pHeaders, 'UUID');
    const pQtyIdx = getColumnIndex(pHeaders, 'Quantity');
    const pMinStockIdx = getColumnIndex(pHeaders, 'Min_Stock');
    const pStatusIdx = getColumnIndex(pHeaders, 'Status');

    let pRowIndex = -1;
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][pUuidIdx] === productUuid) {
        pRowIndex = i + 1;
        break;
      }
    }

    if (pRowIndex !== -1) {
      let currentStock = Number(pData[pRowIndex - 1][pQtyIdx]);
      
      // Revert old
      if (oldType === 'Out') currentStock += oldQty;
      else currentStock -= oldQty;

      // Apply new
      if (newType === 'Out') currentStock -= qtyChange;
      else currentStock += qtyChange;

      pSheet.getRange(pRowIndex, pQtyIdx + 1).setValue(currentStock);
      
      const minStock = Number(pData[pRowIndex - 1][pMinStockIdx]);
      let newStatus = 'Active';
      if (currentStock <= 0) newStatus = 'Out of Stock';
      else if (currentStock <= minStock) newStatus = 'Low Stock';
      pSheet.getRange(pRowIndex, pStatusIdx + 1).setValue(newStatus);
    }

    // 2. Update Transaction Row
    tSheet.getRange(rowIndex, 4).setValue(newType);
    tSheet.getRange(rowIndex, 5).setValue(qtyChange);
    tSheet.getRange(rowIndex, 6).setValue(unitPrice);
    tSheet.getRange(rowIndex, 7).setValue(total);
    tSheet.getRange(rowIndex, 8).setValue(data.description || '');
    tSheet.getRange(rowIndex, 9).setValue(data.buyerName || '');

    return { success: true, message: "Transaction and stock levels updated successfully." };
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
    const headers = pData[0];
    const uuidIdx = getColumnIndex(headers, 'UUID');
    const qtyIdx = getColumnIndex(headers, 'Quantity');
    const minStockIdx = getColumnIndex(headers, 'Min_Stock');
    const statusIdx = getColumnIndex(headers, 'Status');

    // Build product map: uuid -> { rowIndex (1-based), currentQty, minStock }
    const productMap = {};
    for (let i = 1; i < pData.length; i++) {
      productMap[pData[i][uuidIdx]] = {
        rowIndex: i + 1,
        currentQty: Number(pData[i][qtyIdx]),
        minStock: Number(pData[i][minStockIdx])
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
    const batchId = Utilities.getUuid();
    const fData = fSheet.getDataRange().getValues();
    let currentBalance = 0;
    if (fData && fData.length > 1) {
      currentBalance = Number(fData[fData.length - 1][4] || 0);
    }

    const newTransactionRows = [];
    const newFinanceRows = [];

    // Process each item
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const prod = productMap[item.productUuid];
      const qtyChange = Number(item.qtyChange);
      const unitPrice = Number(item.unitPrice);
      const totalAmount = qtyChange * unitPrice;
      const type = item.type;

      // Update stock quantity in memory map & pData array
      const newQty = type === 'Out' ? prod.currentQty - qtyChange : prod.currentQty + qtyChange;
      
      // Update in-memory map
      productMap[item.productUuid].currentQty = newQty;
      
      // Update pData array for batch write-back
      pData[prod.rowIndex - 1][qtyIdx] = newQty;

      // Update status in pData array
      let newStatus = 'Active';
      if (newQty <= 0) newStatus = 'Out of Stock';
      else if (newQty <= prod.minStock) newStatus = 'Low Stock';
      pData[prod.rowIndex - 1][statusIdx] = newStatus;

      // Prepare Transaction row
      newTransactionRows.push([
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

      newFinanceRows.push([
        timestamp,
        type === 'Out' ? 'Sales' : 'Expenses',
        debit,
        credit,
        currentBalance
      ]);
    }

    // --- BATCH WRITES ---
    
    // 1. Write all product changes back to pSheet
    pSheet.getRange(1, 1, pData.length, pData[0].length).setValues(pData);

    // 2. Write all new transaction rows in one go
    if (newTransactionRows.length > 0) {
      tSheet.getRange(tSheet.getLastRow() + 1, 1, newTransactionRows.length, 10).setValues(newTransactionRows);
    }

    // 3. Write all new finance rows in one go
    if (newFinanceRows.length > 0) {
      fSheet.getRange(fSheet.getLastRow() + 1, 1, newFinanceRows.length, 5).setValues(newFinanceRows);
    }

    // 4. Handle Customer Balance & Ledger if customerUuid is provided
    if (payload.customerUuid) {
      let cSheet = ss.getSheetByName(CUSTOMERS_SHEET);
      let lSheet = ss.getSheetByName(CUSTOMER_LEDGER_SHEET);
      
      // ... (Customer logic also benefits from cache clear below)
      const cData = cSheet.getDataRange().getValues();
      let cRowIndex = -1;
      for (let i = 1; i < cData.length; i++) {
        if (cData[i][0] === payload.customerUuid) {
          cRowIndex = i + 1;
          break;
        }
      }

      if (cRowIndex !== -1) {
        let netImpact = 0;
        for (const item of items) {
          const itemTotal = Number(item.qtyChange) * Number(item.unitPrice);
          if (item.type === 'Out') netImpact += itemTotal;
          else netImpact -= itemTotal;
        }

        const oldBalance = Number(cData[cRowIndex - 1][4]);
        const newBalance = oldBalance + netImpact;
        cSheet.getRange(cRowIndex, 5).setValue(newBalance);

        lSheet.appendRow([
          Utilities.getUuid(),
          timestamp,
          payload.customerUuid,
          netImpact >= 0 ? 'Receivable' : 'Payable',
          Math.abs(netImpact),
          "Order: " + (payload.description || "Batch") + " (" + batchId + ")",
          newBalance
        ]);
      }
    }

    // CLEAR CACHE to ensure immediate updates on frontend
    const cache = CacheService.getScriptCache();
    cache.removeAll(['UMS_CACHE_dashboard', 'UMS_CACHE_transactions', 'UMS_CACHE_reports', 'UMS_CACHE_customers']);

    return { success: true, message: "Batch of " + items.length + " item(s) processed successfully." };

  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}
function getProductionsData() {
  const ss = getSS();
  const prodSheet = ss.getSheetByName(PRODUCTIONS_SHEET);
  if (!prodSheet) return [];
  const data = prodSheet.getDataRange().getValues();
  
  if (data.length <= 1) return [];

  const productions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    productions.push({
      id: row[0],
      date: row[1],
      productUuid: row[2],
      productName: row[3],
      qtyProduced: Number(row[4]),
      rawMaterialsUsed: row[5] ? JSON.parse(row[5]) : [],
      costPerUnit: Number(row[6]),
      salePerUnit: Number(row[7]),
    });
  }
  
  return productions.reverse();
}

function processProduction(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = getSS();
    const pSheet = ss.getSheetByName(PRODUCTS_SHEET);
    let prodSheet = ss.getSheetByName(PRODUCTIONS_SHEET);
    
    if (!prodSheet) {
      // Automatically try to create it if it's missing
      setupDatabase();
      prodSheet = ss.getSheetByName(PRODUCTIONS_SHEET);
    }

    if (!prodSheet) throw new Error("Productions sheet could not be initialized. Please run setupDatabase() manually in the script editor.");
    
    const pData = pSheet.getDataRange().getValues();
    const headers = pData[0];
    const uuidIdx = getColumnIndex(headers, 'UUID');
    const qtyIdx = getColumnIndex(headers, 'Quantity');
    const minStockIdx = getColumnIndex(headers, 'Min_Stock');
    const statusIdx = getColumnIndex(headers, 'Status');
    const rawIdx = getColumnIndex(headers, 'Raw_Materials');
    const buyPriceIdx = getColumnIndex(headers, 'Buy_Price');
    const salePriceIdx = getColumnIndex(headers, 'Sale_Price');
    const nameColIdx = getColumnIndex(headers, 'Name');

    let productRowIndex = -1;
    let productRow = null;
    
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][uuidIdx] === data.productUuid) {
        productRowIndex = i + 1;
        productRow = pData[i];
        break;
      }
    }

    if (!productRow) throw new Error("Product not found.");

    const rawMaterials = productRow[rawIdx] ? JSON.parse(productRow[rawIdx]) : [];
    const qtyToProduce = Number(data.qtyProduced);
    
    if (qtyToProduce <= 0) throw new Error("Quantity must be greater than zero.");

    // Validate availability and track usage
    const materialsUsed = [];
    const updatedRawMaterials = rawMaterials.map(rm => {
      const needed = rm.requiredPerProduct * qtyToProduce;
      if (rm.quantity < needed) {
        throw new Error(`Insufficient ${rm.name}. Available: ${rm.quantity}, Needed: ${needed}`);
      }
      materialsUsed.push({ name: rm.name, qtyUsed: needed });
      return {
        ...rm,
        quantity: rm.quantity - needed
      };
    });

    // Update finished goods qty and status
    const currentFinishedQty = Number(productRow[qtyIdx]);
    const newFinishedQty = currentFinishedQty + qtyToProduce;
    const minStock = Number(productRow[minStockIdx]);
    let newStatus = 'Active';
    if (newFinishedQty <= 0) newStatus = 'Out of Stock';
    else if (newFinishedQty <= minStock) newStatus = 'Low Stock';

    // Update pData array in memory
    pData[productRowIndex - 1][rawIdx] = JSON.stringify(updatedRawMaterials);
    pData[productRowIndex - 1][qtyIdx] = newFinishedQty;
    pData[productRowIndex - 1][statusIdx] = newStatus;

    // Batch write all product changes back to pSheet
    pSheet.getRange(1, 1, pData.length, pData[0].length).setValues(pData);

    // Record production entry
    const timestamp = new Date();
    const productionId = Utilities.getUuid();
    
    prodSheet.appendRow([
      productionId,
      timestamp,
      data.productUuid,
      productRow[nameColIdx], // Name
      qtyToProduce,
      JSON.stringify(materialsUsed),
      Number(productRow[buyPriceIdx]), // Buy Price (Cost)
      Number(productRow[salePriceIdx])  // Sale Price
    ]);

    // CLEAR CACHE
    const cache = CacheService.getScriptCache();
    cache.removeAll(['UMS_CACHE_dashboard', 'UMS_CACHE_productions']);

    return { success: true, message: "Production recorded and materials deducted." };

  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}
function getCustomersData() {
  const ss = getSS();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const customers = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    customers.push({
      uuid: row[0],
      name: row[1],
      phone: row[2],
      email: row[3],
      balance: Number(row[4] || 0),
      status: row[5]
    });
  }
  return customers;
}

function getCustomerLedger(uuid) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CUSTOMER_LEDGER_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const ledger = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[2] === uuid) {
      ledger.push({
        id: row[0],
        date: row[1],
        customerUuid: row[2],
        type: row[3],
        amount: Number(row[4]),
        description: row[5],
        balanceSnapshot: Number(row[6])
      });
    }
  }
  return ledger.reverse();
}

function addCustomer(data) {
  const ss = getSS();
  let sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CUSTOMERS_SHEET);
    sheet.appendRow(['UUID', 'Name', 'Phone', 'Email', 'Current_Balance', 'Status']);
  }
  const uuid = Utilities.getUuid();
  
  sheet.appendRow([
    uuid,
    data.name,
    data.phone || '',
    data.email || '',
    0, // Initial balance
    'Active'
  ]);
  
  return { success: true, message: "Customer added successfully.", uuid: uuid };
}

function recordCustomerPayment(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  
  try {
    const ss = getSS();
    let cSheet = ss.getSheetByName(CUSTOMERS_SHEET);
    let lSheet = ss.getSheetByName(CUSTOMER_LEDGER_SHEET);
    
    if (!cSheet) {
      cSheet = ss.insertSheet(CUSTOMERS_SHEET);
      cSheet.appendRow(['UUID', 'Name', 'Phone', 'Email', 'Current_Balance', 'Status']);
    }
    if (!lSheet) {
      lSheet = ss.insertSheet(CUSTOMER_LEDGER_SHEET);
      lSheet.appendRow(['ID', 'Date', 'Customer_UUID', 'Type', 'Amount', 'Description', 'Balance_Snapshot']);
    }
    
    const cData = cSheet.getDataRange().getValues();
    let rowIndex = -1;
    let currentBalance = 0;
    
    for (let i = 1; i < cData.length; i++) {
      if (cData[i][0] === data.customerUuid) {
        rowIndex = i + 1;
        currentBalance = Number(cData[i][4] || 0);
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Customer not found.");
    
    const amount = Number(data.amount);
    const type = data.type; // 'Receivable' (they owe me more) or 'Payment' (they paid me) or 'Payable' (I owe them)
    
    // Balance logic: Positive = they owe me, Negative = I owe them
    let newBalance = currentBalance;
    if (type === 'Receivable') newBalance += amount;
    else if (type === 'Payment') newBalance -= amount;
    else if (type === 'Payable') newBalance -= amount;
    
    // Update customer sheet
    cSheet.getRange(rowIndex, 5).setValue(newBalance);
    
    // Record in ledger
    lSheet.appendRow([
      Utilities.getUuid(),
      new Date(),
      data.customerUuid,
      type,
      amount,
      data.description || '',
      newBalance
    ]);
    
    return { success: true, message: "Payment recorded successfully.", newBalance: newBalance };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deleteCustomer(data) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  const dataRows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < dataRows.length; i++) {
    if (dataRows[i][0] === data.customerUuid) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex);
    return { success: true, message: "Customer deleted." };
  }
  return { success: false, message: "Customer not found." };
}
