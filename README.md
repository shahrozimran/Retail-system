# 🏪 Retail Inventory Management System & Mobile App
### 🚗 Built for **Global Auto Parts**

A high-performance, professional command center and native mobile application for managing retail inventory, sales transactions, manufacturing (production), raw materials, and customer credit ledgers (Khata). 

This system integrates a modern **Next.js 16 (React 19)** web frontend, a packaged **Capacitor Android native app**, and a serverless **Google Sheets backend** powered by **Google Apps Script (GAS)**.

---

## 🌟 Core Modules & Features

### 📊 Intelligent Dashboard
*   **Real-time Analytics**: Displays total stock value, available cash balance, and current day's sales instantly.
*   **Smart Low-Stock Alerts**: Visual indicators with progress bars and color-coded status badges for items below their safety thresholds.
*   **Activity Feed**: Live chronologically sorted feed of recent transactions for immediate business oversight.

### 📒 Customer Credit Ledger (Khata)
*   **Credit/Debit Tracking**: Real-time balance calculations showing exactly who owes money ("Receivable") and who is owed ("Payable").
*   **Transaction Auditing**: Separate, dedicated ledger histories for individual customers tracking payments and balance snapshots.
*   **Direct Transaction Linkage**: Integrates with the transaction module to auto-select customer files and fetch current balances.

### 🏭 Production & Manufacturing
*   **Formula-based Production**: Convert raw materials into finished auto parts in a single click.
*   **Inventory Auto-Deduction**: Validates raw material stock availability first and automatically subtracts consumed raw materials.
*   **Dynamic Quantity Preview**: Shows how many units can potentially be manufactured based on current raw material inventory levels.

### 📦 Inventory Management
*   **Category Autocomplete**: Intelligent predictions based on existing items to prevent duplicates and keep categories tidy.
*   **Dynamic Status Control**: Automates product statuses (`Active`, `Low Stock`, `Out of Stock`) based on real-time quantities.
*   **Type-safe Search**: Search products by Name or SKU instantly without crashes.

### 🛒 Advanced Transactions (Shopping Cart Style)
*   **Batch Operations**: Record multiple sales or restock items in a single transaction to reduce latency.
*   **Dual-Type Support**: Seamlessly processes both `Sales` (Stock Out / Credit/Debit) and `Restocking` (Stock In).
*   **Invoicing**: Automatically generates professional PDFs utilizing `jsPDF` and `jsPDF-AutoTable` with detailed line-items, sub-totals, and customer ledger balances.

### 📱 Android Native Mobile Application
*   **Native Webview Wrapper**: Runs as a fast, light, and optimized APK on Android devices using **Capacitor**.
*   **CORS Bypass via CapacitorHttp**: Utilizes native network requests through `@capacitor/core` so that the app communicates directly with Google Apps Script, bypassing web browser CORS constraints.
*   **Client-Side Guarding**: Custom `useAuthGuard` handles user access checking without depending on Next.js server-side middleware (which does not execute in static native webviews).

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Premium, fast, and structured user interface. |
| **Mobile App Native Wrapper** | Capacitor 8.4 | Cross-platform native bridge for packaging the app. |
| **Styling** | Tailwind CSS 4 & PostCSS | Elegant layout with glassmorphic elements and dark mode. |
| **State & Cache** | SWR (Stale-While-Revalidate) | Immediate loading UI by showing cache first while syncing. |
| **PDF Generation** | `jsPDF` & `jsPDF-AutoTable` | Client-side export of invoices and ledger summaries. |
| **Backend & API** | Google Apps Script (GAS) | Serverless API handling database mutations, locks, and cache. |
| **Database** | Google Sheets | Secure, real-time spreadsheet acting as a zero-cost database. |

---

## 🔐 Credentials & Security

The application is protected with basic authentication. When accessing the system, use the following credentials:

*   **Username**: `admin`
*   **Password**: `globalautoparts`

---

## ⚙️ Setup & Installation Guide

### 📋 Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js (v18 or higher)](https://nodejs.org/)
*   [Git](https://git-scm.com/)
*   [Java Development Kit (JDK) 17](https://www.oracle.com/java/technologies/downloads/) (Required for Android builds)
*   [Android Studio](https://developer.android.com/studio) (Required for running/building the Android App)

---

### 1️⃣ Backend Setup (Google Sheets & Apps Script)

1.  Create a new **Google Sheet** in your Google Drive.
2.  Open **Extensions > Apps Script** from the top menu.
3.  Delete any default code and copy the contents of [Code.gs](file:///d:/Desktop/Projects/Retail%20System/Code.gs) from this project into the Apps Script editor.
4.  Run the `setupDatabase` function from the editor's function selector once. This initializes the sheets (`Products`, `Transactions`, `Finances`, `Productions`, `Customers`, `CustomerLedger`, `RawMaterials`) with required headers and formatting.
5.  Click **Deploy > New Deployment**.
    *   **Select type**: Web App
    *   **Description**: Retail System Production API
    *   **Execute as**: Me (your-email@gmail.com)
    *   **Who has access**: Anyone
6.  Click **Deploy** and authorize the script.
7.  Copy the **Web App URL** generated (e.g., `https://script.google.com/macros/s/.../exec`).

---

### 2️⃣ Frontend Setup (Next.js Web App)

1.  Navigate into the `frontend` folder:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env.local` file inside the `frontend/` directory:
    ```env
    NEXT_PUBLIC_API_URL=YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL
    ```
    *(Replace `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL` with the URL copied from Step 1).*
4.  Run the local development server:
    ```bash
    npm run dev
    ```
5.  Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 3️⃣ Android Mobile App Setup (Capacitor)

Capacitor requires static files to run. Because Next.js serves pages dynamically by default, a specialized build process is utilized:

> [!IMPORTANT]
> Next.js dynamic API routes (`src/app/api`) fail during static exports. 
> To bypass this, we use [build-static.js](file:///d:/Desktop/Projects/Retail%20System/frontend/build-static.js) which temporarily moves API routes during production compiles and restores them afterwards.

#### Step A: Generate the Static Export
1.  Open your terminal in the `frontend` directory.
2.  If you have a local dev server running (`npm run dev`), **stop it first** (Ctrl + C) to prevent file-lock conflicts.
3.  Run the static build command:
    ```bash
    npm run build
    ```
    *This runs `build-static.js`, executing a clean `next build` that exports static files into the `frontend/out/` directory.*

#### Step B: Sync Static Files to Android
Sync the exported web files and configurations to the Android native folder:
```bash
npx cap sync
```

#### Step C: Open and Run in Android Studio
1.  To open the project inside Android Studio:
    ```bash
    npx cap open android
    ```
2.  Wait for Android Studio to index the project and sync Gradle dependencies.
3.  Connect an Android device (via USB with USB debugging enabled) or start a Virtual Device (Emulator).
4.  Click **Run (Play button)** in Android Studio to install and launch the app on your device!

#### Step D: Building a Standalone APK
1.  Inside Android Studio, navigate to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
2.  Once complete, a notification will appear. Click **Locate** to retrieve your compiled `app-debug.apk` file, which can be installed on any Android device.

---

## 📂 Key Directory Structure

```
Retail System/
├── Code.gs                   # Backend Google Apps Script codebase
├── README.md                 # Main documentation (this file)
└── frontend/                 # Next.js & Capacitor project
    ├── capacitor.config.json # Capacitor app settings (App ID, app name, CORS tools)
    ├── package.json          # Node configuration & scripts
    ├── build-static.js       # Production build wrapper for static export
    ├── android/              # Native Android gradle project
    └── src/
        ├── app/
        │   ├── (auth)/login/ # Admin Authentication page
        │   ├── (dashboard)/  # Main business console routes:
        │   │   ├── page.tsx  # Dashboard overview
        │   │   ├── customers/# Customer ledger / Khata
        │   │   ├── inventory/# Products catalog
        │   │   ├── production/# Formula manufacturing panel
        │   │   └── raw-materials/ # Raw materials stock panel
        │   └── api/proxy/    # Server-side API proxy (used on Web only)
        ├── components/       # Common UI elements (Modals, Invoices, Layouts)
        └── hooks/
            └── useAuthGuard.ts # Static app auth checking
```

---

## 👥 Author Information
**Shahroz Imran**
*   **Address**: House 10A, Street 25B, New Wassan Pura, Lahore, Pakistan
*   **Phone**: 03114437441
*   **Email**: Shahrozimran01@gmail.com

---
*Created and optimized with Antigravity AI.*
