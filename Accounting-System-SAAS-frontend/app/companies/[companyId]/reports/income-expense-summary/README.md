# Income & Expense Summary Report

## Overview
The Income & Expense Summary report provides a comprehensive breakdown of income and expenses grouped by department and/or project. This report helps identify which departments or projects are most profitable or incurring the highest costs.

## Features

### 1. Flexible Grouping Options
- **Department & Project**: Shows detailed breakdown by both dimensions
- **Department Only**: Aggregates all transactions by department
- **Project Only**: Aggregates all transactions by project

### 2. Filtering Options
- **Date Range**: Filter transactions between specific dates (required)
- **Department Filter**: View data for a specific department only
- **Project Filter**: View data for a specific project only
- **Calendar Mode**: Supports both AD (Gregorian) and BS (Nepali) dates

### 3. Visual Analytics
- **Interactive Bar Chart**: Displays income vs expense vs net profit/loss
- Color-coded visualization:
  - Green: Income and Profit
  - Red: Expense and Loss
  - Blue: Net Profit (when positive)
  - Orange: Net Loss (when negative)

### 4. Export & Print
- **Excel/CSV Export**: Download report data as CSV file
- **Print**: Professional print layout optimized for paper

### 5. Data Display
- **Color-Coded Table**: Easy-to-read table with color-coded financial data
- **Summary Totals**: Overall totals for income, expense, and net
- **Responsive Design**: Works on all screen sizes
- **Dark Mode Support**: Automatically adapts to system theme

## How to Use

### Accessing the Report
1. Navigate to your company dashboard
2. Click on "Reports" in the navigation menu
3. Select "Income & Expense Summary"

### Basic Usage
1. **Select Date Range**: 
   - The report defaults to the current month
   - Adjust "From date" and "To date" as needed
   
2. **Choose Grouping Mode**:
   - Select how you want to view the data (Department & Project, Department Only, or Project Only)

3. **Apply Filters** (Optional):
   - Select specific department from the dropdown
   - Select specific project from the dropdown
   
4. **View Results**:
   - Review the chart for visual overview
   - Examine the detailed table for specific figures

### Advanced Features

#### Filtering by Department
To see expenses and income for a specific department:
1. Select the department from the "Department" dropdown
2. The report will show only transactions for that department
3. If "Project" filter is also applied, you'll see data for that department-project combination

#### Filtering by Project
Similar to department filtering, select a specific project to view its financial performance.

#### Changing Grouping Mode
- **Department & Project**: Best for detailed analysis of each department-project combination
- **Department Only**: Best for overall department performance
- **Project Only**: Best for overall project performance

#### Calendar Mode
If your company uses Bikram Sambat (BS) dates:
1. The system will automatically detect your company's calendar setting
2. Toggle between AD and BS display using the "Date Display" dropdown

### Understanding the Data

#### Income
- Represents all credit amounts from ledgers in INCOME groups
- Formula: Total Credits - Total Debits for income ledgers

#### Expense  
- Represents all debit amounts from ledgers in EXPENSE groups
- Formula: Total Debits - Total Credits for expense ledgers

#### Net (Profit/Loss)
- Calculated as: Income - Expense
- Positive value (green) = Profit
- Negative value (red) = Loss

### Export Options

#### Excel/CSV Export
1. Click "Export Excel" button
2. File downloads as `income-expense-summary.csv`
3. Opens in Excel, Google Sheets, or any CSV-compatible application
4. Includes:
   - Company name
   - Report title
   - Date range
   - All data rows
   - Summary totals

#### Printing
1. Click "Print" button
2. Opens print-optimized view in new window
3. Use browser's print function (Ctrl+P / Cmd+P)
4. Charts are automatically hidden in print view
5. Professional table formatting for paper

## Technical Details

### Data Source
- Pulls data from voucher lines in the accounting system
- Categorizes transactions based on ledger group types
- Respects department and project assignments on voucher lines

### Accounting Logic
The report follows standard accounting principles:
- **Income Ledgers**: Credit increases income
- **Expense Ledgers**: Debit increases expense
- Transactions without department/project are shown as "None"

### Performance
- Real-time data fetching
- Optimized database queries
- Client-side grouping for fast mode switching

## Tips & Best Practices

1. **Regular Review**: Run this report monthly to track performance trends
2. **Compare Periods**: Export multiple months and compare in spreadsheet
3. **Drill Down**: Use filters to investigate specific departments or projects
4. **Visual First**: Check the chart for quick overview, then dive into table for details
5. **Share**: Use print or export features to share with stakeholders

## Troubleshooting

### No Data Showing
- Check that vouchers exist for the selected date range
- Verify that vouchers have lines assigned to income/expense ledgers
- Ensure department/project filters aren't too restrictive

### Missing Departments/Projects
- Transactions without cost center assignments show as "None"
- Review vouchers to ensure proper department/project assignment

### Incorrect Totals
- Verify ledger group types (INCOME vs EXPENSE)
- Check that ledgers are assigned to correct groups
- Ensure vouchers are dated within the selected range

## Related Reports
- **Profit & Loss**: Overall profitability without department/project breakdown
- **Trial Balance**: Complete list of all ledger balances
- **Ledger Report**: Detailed transaction history for specific ledgers
- **Party Statement**: Detailed party-wise transaction history
