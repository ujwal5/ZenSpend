# ZenSpend


# ZenSpend ₹ — Personal Finance Tracker

**Track your money. Understand your habits. Spend mindfully.**

ZenSpend ₹ is a personal finance tracker built with HTML, CSS, and vanilla JavaScript. It helps you record income and expenses, monitor spending, review weekly and monthly reports, and understand where your money goes.

Designed for personal use, ZenSpend features a responsive interface that works on laptops and mobile devices.

## ✨ Features

### 🏠 Home
- View income, expenses, and net cash flow.
- See recent transactions at a glance.
- Quickly navigate to add income or expenses.
- Review your current reporting period.

### ➕ Add Transactions
- Record income and expenses separately.
- Enter the amount, description, category, and date.
- Choose a payment method.
- Add optional notes.
- Edit or delete existing transactions.

### 📊 Analysis
- Switch between weekly and monthly reports.
- Visualize income and expenses with charts.
- See spending by category.
- Review cash flow and savings rate.
- Identify your highest-spending category.
- View average expense amounts.

### 🎯 Budget Tracking
- Set monthly budgets for expense categories.
- Compare spending with your budget.
- Monitor progress and identify overspending.

### 🔎 Transaction Management
- Search transactions.
- Filter by transaction type.
- Filter by category.
- Review, edit, or delete individual entries.

### 💾 Data & Backups
- Store transactions locally in your browser.
- Export your records as a JSON backup.
- Import a previous backup.
- Keep your personal financial records under your control.

### 📱 Responsive Design
- Optimized for laptop and desktop screens.
- Mobile-friendly layout.
- Bottom navigation for convenient mobile use.
- Add the website to your phone's Home Screen for quick access.

## 🛠️ Built With

- **HTML5** — Application structure
- **CSS3** — Styling and responsive layouts
- **JavaScript** — Transaction management, calculations, charts, and local storage
- **Browser Local Storage** — Local persistence
- **HTML Canvas** — Charts and visual reports
- **GitHub Pages** — Optional static hosting

No frontend framework is required.

## 📁 Project Structure

```text
zenspend/
├── index.html
├── style.css
├── app.js
├── README.md
├── manifest.json       # If configured for PWA installation
├── sw.js               # If a service worker is configured
└── assets/
    └── icons/          # Optional app icons
```

The `manifest.json`, `sw.js`, and `assets/` files are optional and should be included only if they exist in your project.

## 🚀 Run Locally

1. Download or clone this repository.
2. Open the project folder.
3. Open `index.html` in a modern browser.

For a more reliable local development setup, use the Live Server extension in Visual Studio Code.

## 🌐 Deploy with GitHub Pages

1. Push your project files to a GitHub repository.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under the build and deployment section, select **Deploy from a branch**.
5. Select your main branch and the root folder.
6. Save the settings.
7. Open the published URL once deployment finishes.

Your website URL will generally follow this format:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

Replace the placeholders with your GitHub username and repository name.

## 📲 Add ZenSpend to Your Phone

After opening the deployed website over HTTPS:

### iPhone
1. Open the website in Safari.
2. Tap the Share button.
3. Select **Add to Home Screen**.
4. Confirm the name and tap Add.

### Android
1. Open the website in Chrome.
2. Open the browser menu.
3. Select **Add to Home screen** or **Install app**, if available.
4. Follow the on-screen instructions.

A Home Screen shortcut does not automatically guarantee offline support. Offline operation requires a correctly configured service worker and cached application files.

## 🔐 Privacy & Data Storage

ZenSpend is intended for personal finance tracking.

- Transaction data is stored in the browser's local storage.
- There is no built-in account or cloud synchronization in this version.
- Data stored in one browser or device is not automatically available on another device.
- Clearing browser data, changing browser profiles, or uninstalling a browser may remove locally stored records.
- Private browsing modes may not retain data permanently.
- Anyone with access to the same browser profile may be able to view the stored records.

**Important:** Hosting the website on GitHub Pages does not, by itself, upload your local transaction records to GitHub. However, never commit exported transaction backups or other private financial data to your repository.

Export backups regularly and keep them in a secure location.

## 📈 Reports Explained

### Weekly Report
Shows transactions dated Monday through Sunday for the selected date.

### Monthly Report
Shows transactions dated within the selected calendar month.

### Net Cash Flow
Calculated as:

```text
Net Cash Flow = Total Income − Total Expenses
```

### Savings Rate
Calculated when income is greater than zero:

```text
Savings Rate = (Income − Expenses) / Income × 100
```

A negative net cash flow indicates that recorded expenses exceeded recorded income for the selected period.

## 🧪 Recommended Testing

Before relying on ZenSpend for daily tracking, verify:

- [ ] Add an income transaction.
- [ ] Add an expense transaction.
- [ ] Confirm that totals update correctly.
- [ ] Switch between weekly and monthly reports.
- [ ] Change the report date.
- [ ] Check category-wise charts.
- [ ] Set and update a category budget.
- [ ] Search and filter transactions.
- [ ] Edit and delete a transaction.
- [ ] Export and import a backup.
- [ ] Refresh the browser and verify that data remains.
- [ ] Test the interface on a laptop and a mobile device.

## 🗺️ Roadmap

Potential future improvements:

- [ ] Enhanced PWA installation and offline support.
- [ ] Improved charts and report comparisons.
- [ ] Recurring expenses and income.
- [ ] Custom categories.
- [ ] Budget notifications.
- [ ] CSV export.
- [ ] Monthly PDF reports.
- [ ] Optional encrypted backup functionality.

## 📄 License

Choose a license before making the repository public. If this is intended only for personal use, you can keep the repository private and use GitHub Pages according to your GitHub plan and repository settings.

---

**ZenSpend ₹**  
*Your money, your clarity, your control.*
