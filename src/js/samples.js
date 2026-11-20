/**
 * The welcome example and the templates of "New". The two README examples and Example.shls /
 * Example2.shls are the examples of the SHLS repository
 * (https://github.com/SebisCodes/SHLS-Sebis-Hierarchical-List-Structure).
 */

/** The first example of the SHLS README: products and companies with nested lists. */
const README_1 = `Product
 Name
 Category
 Price
 InStock
 Released

 Smartphone A1
 Electronics
 599.99
 true
 2023-09-01

 Laptop B2
 Electronics
 1299.99
 false
 2022-05-15

 Table X5
 Furniture
 349.99
 true
 2021-11-12

Company
 Name
 Location
  Country
  City
 Founded
 Employees

 TechCorp
 PH
  USA
  San Francisco
  USA
  New York
 2010
 500

 FurniCo
 PH
  Germany
  Berlin
  Switzerland
  Zürich
 2015
 150
`;

/** The second example of the SHLS README: the key blocks first, the records later. */
const README_2 = `Product
 Name
 Category
 Price
 InStock
 Released

Company
 Name
 Location
  Country
  City
 Founded
 Employees

Product
 Smartphone A1
 Electronics
 599.99
 true
 2023-09-01

 Laptop B2
 Electronics
 1299.99
 false
 2022-05-15

 Table X5
 Furniture
 349.99
 true
 2021-11-12

Company
 TechCorp
 PH
  USA
  San Francisco
  USA
  New York
 2010
 500

 FurniCo
 PH
  Germany
  Berlin
  Switzerland
  Zürich
 2015
 150
`;

/** Example.shls of the SHLS repository. */
const EXAMPLE = `Company
 ID
 Name
 Founded
 Location
 Departments
  DepartmentID
  DepartmentName
  Employees
   EmployeeID
   Name
   Role
   Salary
   StartDate
   FullTime

 1001
 Tech Solutions Inc.
 2008
 New York, USA
 Departments
  001
  Development
  Employees
   1001
   Alice Smith
   Software Engineer
   90000
   2019-06-01
   true

   1002
   Bob Johnson
   Data Scientist
   95000
   2020-02-15
   true

  002
  Human Resources
  Employees
   2001
   Carol White
   HR Specialist
   60000
   2021-09-10
   true

   2002
   David Brown
   Recruiter
   55000
   2018-11-05
   false

  003
  Marketing
  Employees
   3001
   Emily Green
   Marketing Lead
   80000
   2017-03-20
   true

   3002
   Frank Black
   Social Media Manager
   50000
   2022-08-15
   true

Financials
 Year
 Revenue
 Expenses
 NetProfit

 2021
 5000000
 3500000
 1500000

 2022
 5200000
 3700000
 1500000

 2023
 5400000
 3800000
 1600000
`;

/** Example2.shls of the SHLS repository. */
const EXAMPLE_2 = `Company
 ID
 Name
 Founded
 Location
 Departments
  DepartmentID
  DepartmentName
  Employees
   EmployeeID
   Name
   Role
   Salary
   StartDate
   FullTime

Financials
 Year
 Revenue
 Expenses
 NetProfit
 
Company
 1001
 Tech Solutions Inc.
 2008
 New York, USA
 Departments
  001
  Development
  Employees
   1001
   Alice Smith
   Software Engineer
   90000
   2019-06-01
   true
   1002
   Bob Johnson
   Data Scientist
   95000
   2020-02-15
   true
  002
  Human Resources
  Employees
   2001
   Carol White
   HR Specialist
   60000
   2021-09-10
   true
   2002
   David Brown
   Recruiter
   55000
   2018-11-05
   false
  003
  Marketing
  Employees
   3001
   Emily Green
   Marketing Lead
   80000
   2017-03-20
   true
   3002
   Frank Black
   Social Media Manager
   50000
   2022-08-15
   true
   
Financials
 2021
 5000000
 3500000
 1500000
 
 2022
 5200000
 3700000
 1500000
 
 2023
 5400000
 3800000
 1600000
`;

/** The document of a new browser: the welcome example. */
export const START = { name: 'Welcome', code: README_1 };

/** The templates of the New menu by their data-new key: a name and the code. */
export const TEMPLATES = {
    readme1: { name: 'Products and companies', code: README_1 },
    readme2: { name: 'Key blocks first', code: README_2 },
    example: { name: 'Example', code: EXAMPLE },
    example2: { name: 'Example2', code: EXAMPLE_2 },
    section: { name: 'Section', code: 'Section\n Name\n Note\n\n -\n -\n' },
};

/** The code of a blank document. */
export const BLANK = '';
