# DOM

  DOM is an application for Home Building Managers and people, living in a shared Home Building, built with JS and Supabase. Users can be Admins, Registered Users, and Guests. Admins can manage the building, users, and events. Registered Users can view and participate in events, mark their payment obligations and manage their profiles. Guests can view public information about the building and events. User can register, log in, and log out. Logged in users can view and manage their profiles, including their payment obligations. Admins can create and manage events, as well as manage users and building information. Admins can create/update/delete (manage) independent objects of the Home Building. Admins can also create payment obligations for each month for every independent object in the Home Building. All users can see the payment obligations for all independent objects in the Home Building as well as what is paid and what is pending. Only Admins can mark payment obligations as paid. All users can see on the dashboard how much money are in the Home Building's account and how much is owed. All users can create message themes for discussions and participate in them by adding comments or/and attaching files.

## Architecrute and Technology Stack:
 Classical client-server app:
  - Front-end: JS app, Bootstrap, HTML, CSS.
  - Back-end: Supabase
  - DataBase: PostgreSQL
  - Authentication: Supabase Auth
  - Build Tool: Vite, npm
  - API: Supabase REST API
  - File Storage: Supabase Storage
  - Hosting: Netlify
  - Source Code: GitHub

  ## Modular Design:
 - Use modular code structure, with separate files for different components, pages and features. Use ES6 modules to organize the code and make it more maintainable. Use a consistent coding style and follow best practices for JavaScript development.

  ## UI Gidelines:
  - Use HTML, CSS, Bootstrap and vanilla JS for the front-end development.
  - Use Bootstrap components and utilities to create a responsive and user-friendly interface.
  - Implement modern, responsive UI design, with semantic HTML.
  - Use a consistent color scheme and typography throughout the application.
  - Use appropriate icons, effects and visual cues to enhance usability.


  ## Pages and Navigation:
  - Split the application into multiple pages or views, such as Home, Dashboard, Register, LoginEvents, Payments, Discussions, Profile, Admin Panel, etc.
  - Implement pages as reusable components (HTML, CSS and JS code).
  - Use roiting to navigate between pages, and ensure that the URL reflects the current page for better user experience and SEO.
  - Use full URLs like /, /login, /register, /dashboard, /events, /payments, /discussions, /profile, /admin for navigation.

  ## Back-end and Database:
  - Use Supabase as the back-end service to handle authentication, database operations, and file storage.
  - Use PostgreSQL as the database with tables for users, events, payment obligations, discussions, messages, etc.
  - Use Supabase storage for file uploads and management, allowing users to attach files to discussions and events.
  - Design the database schema to support the application's features, including tables for users, events, payment obligations, discussions, messages, etc.
  - When changing the database schema, always use migrations to keep track of changes. 
  - After applying a migration in Supabase, keep a copy of the migration SQL file in the code.

   ## Authentication and Authorization:
  - Use Supabase Auth for user authentication and authorization, ensuring that only authorized users can access certain features and data.
  - Implement RLS policies to restrict access to data based on user roles and permissions.
  - Implement user roles with a separate DB table in the database: `user_roles`+ enum `roles` with values: `admin`, `user`, `guest`.