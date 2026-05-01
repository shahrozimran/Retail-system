# Retail Inventory Management System - Global Auto Parts

A high-performance, professional command center for managing retail inventory, sales transactions, manufacturing (production), and customer ledgers (Khata). Built for **Global Auto Parts**, this system leverages a modern Next.js frontend with a robust Google Sheets backend powered by Google Apps Script.

---

## 🌟 Core Modules

### 📒 Customer Ledger (Khata)
- **Balance Tracking**: Real-time monitoring of "Payable" and "Receivable" status for every customer.
- **Smart Selection**: Integrated customer search in the Transaction module that automatically fetches current balances.
- **Transaction History**: Complete audit trail of customer-specific financial dealings.

### 🏭 Production & Manufacturing
- **Formula-based Production**: Convert raw materials into finished goods with a single click.
- **Inventory Deduction**: Automatic stock reduction of raw materials upon successful production.
- **Stability**: Type-safe search filters that handle both numeric SKUs and named products without crashing.

### 📊 Intelligent Dashboard
- **Real-time Analytics**: Monitor total stock value, cash balance, and today's sales at a glance.
- **Smart Alerts**: Visual indicators for low-stock items with progress bars and status badges.
- **Activity Feed**: Live feed of recent transactions for immediate oversight.

### 📦 Inventory Management
- **Category Autocomplete**: Intelligent suggestions based on existing stock to ensure consistent data entry.
- **Dynamic Stock Tracking**: Automated status updates (Active, Low Stock, Out of Stock) based on custom thresholds.
- **SKU Management**: Simplified product tracking with dedicated SKU and category fields.

### 🛒 Advanced Transactions
- **Batch Processing**: Record multiple products in a single order (Shopping Cart style) for maximum efficiency.
- **Searchable Selector**: Instantly find products by Name or SKU with real-time stock availability check.
- **Dual Type Support**: Handle both "Sales" (Stock Out) and "Restocking" (Stock In) seamlessly.

### 📄 Professional Invoicing & Reporting
- **Automated PDF Invoices**: Generate highly formatted, premium invoices using `jsPDF` with full customer balance details.
- **Export Capabilities**: Download reports and invoices with one click, including description and payment terms.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS for a premium, responsive glassmorphic UI.
- **State Management & Fetching**: SWR (Stale-While-Revalidate) for ultra-fast, real-time data synchronization.
- **Icons**: Lucide React for consistent, high-quality visual cues.
- **PDF Generation**: `jsPDF` & `jsPDF-AutoTable`.
- **Backend**: Google Apps Script (GAS) acting as a serverless API.
- **Database**: Google Sheets (highly accessible, zero-cost, real-time database).

---

## 🧠 Technical Architecture & Working

### 1. High-Performance Batching
Unlike traditional row-by-row updates, this system uses **Batch Data Processing** in the backend. When a transaction with 10 items is recorded, the system performs a single read/write operation on Google Sheets, reducing latency from seconds to milliseconds.

### 2. SWR Real-time Sync
The frontend uses **SWR caching**. This ensures that the UI feels "instant" by showing cached data first while fetching updates in the background. On every transaction, the system triggers a global revalidation to keep all dashboard counters perfectly accurate.

### 3. Case-Insensitive Smart Search
All search bars (Inventory, Transactions, Customers) are designed to be type-safe. They explicitly cast data to strings to prevent common JavaScript crashes when handling numeric SKUs or empty records.

---

## 🎯 Use Cases

- **Retail Shops**: General stores, auto parts shops, and electronics retailers.
- **Wholesalers**: Managing large volumes of stock with customer credit tracking (Khata).
- **Small Manufacturers**: Tracking raw material consumption vs. finished goods production.
- **Financial Tracking**: Businesses that need to generate professional invoices while keeping a ledger of debts/credits.

---

## ⚙️ Setup & Installation

### 1. Backend (Google Sheets & Apps Script)
1. Create a new Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Copy the contents of `Code.gs` from this repository into the Apps Script editor.
4. Run the `setupDatabase` function once to initialize headers.
5. Deploy as **Web App** (Execute as "Me", Access: "Anyone").

### 2. Frontend (Next.js)
1. Navigate to `frontend` folder: `cd frontend`.
2. Install dependencies: `npm install`.
3. Set Environment Variable in `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=YOUR_GOOGLE_APPS_SCRIPT_URL
   ```
4. Run development: `npm run dev`.

---

## 👤 Author
**Shahroz Imran**
- **Address:** House 10A Street 25B New Wassan Pura Lahore
- **Phone:** 03114437441
- **Email:** Shahrozimran01@gmail.com

---

*Generated and Optimized by Antigravity AI.*
