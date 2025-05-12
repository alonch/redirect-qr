The app will initially generate and print 'empty' QR codes pointing to unique registration URLs. These will trigger a registration flow when first scanned. Upon registration completion, the system will redirect future scans of that QR code to the registered URL. A DynamoDB table will be used to store and manage QR code state and routing.



# **Designing a Serverless QR Code Registration Web Application**

## **Introduction & Use Case**

Conference organizers often need a quick way to register attendees and share their information. This design outlines a **serverless web application** on AWS that prints QR code stickers for attendees' badges and manages a one-time registration workflow. The workflow is:

* **Badge QR Code Print:** Staff prints a unique QR code sticker and attaches it to an attendee's badge.
* **First Scan – Registration:** When the QR code is scanned *the first time*, it leads to a registration form where the attendee enters their details (or provides a URL to their profile/info).
* **Post-Registration Redirect:** After the form is submitted, any **subsequent scans** of that same QR code will automatically **redirect** to the attendee's provided info URL (or a generated profile page).
* **Re-registration:** If an attendee needs to re-register (e.g. lost badge), a **new** QR code is generated and printed. Each QR code is one-time use – once assigned, it always redirects to the same registered info and cannot be reassigned.

This solution uses **AWS Lambda, API Gateway, S3, and DynamoDB** similar to the current *vanjs-demo* architecture, which uses React for the frontend and Express with serverless-http for the backend. The application will leverage **Web Bluetooth** to print to generic thermal printers. Below, we break down the architecture, components, API design, database schema, and client-side logic in detail.

## **Architecture Overview**

**Overall Design:** The application follows a **serverless single-page application** pattern. A static web front-end served from **Amazon S3** (and optionally distributed via CloudFront) provides the user interface, while **AWS Lambda** functions (exposed through **Amazon API Gateway** HTTP endpoints) implement the backend logic. **Amazon DynamoDB** serves as the persistent data store for QR code records and their state (unassigned or assigned with a redirect URL). This separation ensures a fully managed, scalable solution with minimal operational overhead.

*In this architecture, the front-end is delivered as static content (HTML/JS/CSS) from S3, and all dynamic behavior is handled by multiple AWS Lambda functions behind API Gateway. Each Lambda is invoked via specific API endpoints (URL paths) to handle different aspects of the app's logic. DynamoDB is used as the backend database to store application data (in our case, QR code mappings).*

**Workflow Summary:**

* **1. Static Web App (S3):** Hosts the web interface – including an admin page for printing QR codes and a registration form page for attendees. For example, `index.html` might be the admin/printer interface, and `register.html` the attendee form. These pages use only Vanilla JS (and possibly a tiny library for UI) to keep things light.
* **2. API Gateway:** Provides RESTful endpoints that the front-end calls. Key endpoints include one for generating new QR codes, one for handling registration form submissions, and one for redirecting QR scans to the correct place. The API Gateway invokes the corresponding Lambda functions for each request.
* **3. AWS Lambda Functions:** Three main Lambda functions encapsulate the backend logic:

  * **GenerateQR Lambda:** Creates a new QR code entry in DynamoDB (unassigned) and returns the unique code/URL.
  * **Register Lambda:** Accepts registration form data (including the QR code ID) and updates the DynamoDB entry to mark it assigned and store the attendee's info (e.g. their chosen URL).
  * **Redirect Lambda:** Handles QR code scan requests – looks up the code in DynamoDB and responds with an HTTP redirect to either the registration page (if unregistered) or the final URL (if registered).
* **4. DynamoDB (QR Table):** Stores metadata for each QR code:

  * Partition key is the **QR Code ID** (unique string).
  * Attributes include an **assigned flag or status**, the **final redirect URL** (once registered), and timestamps or user info as needed. This table ensures each code is unique and not reused.
* **5. Bluetooth Printer:** The admin interface uses Web Bluetooth to connect to a **generic Bluetooth thermal printer**. When staff click "Print QR Code", the browser finds the printer, and the app sends printing commands (including the QR code) directly to it. This uses the Web Bluetooth API along with ESC/POS commands to print text/QR images.

*(Optional)* **Diagram:** The architecture can be visualized as: **Client (Browser)** → **Static S3 Website** → (via form or AJAX) → **API Gateway** → **Lambda** → **DynamoDB**. When a QR code is scanned, the request goes **Client Scanner** → **API Gateway (Redirect endpoint)** → **Lambda (lookup)** → **DynamoDB** → **HTTP 302 Redirect** → **Target URL**.

## **Backend Components & API Design**

The backend consists of several Lambda functions fronted by RESTful API endpoints. Below is a breakdown of each component and the API design, following the *vanjs-demo* minimalistic approach.

### **1. DynamoDB QR Code Table**

At the core is a DynamoDB table (e.g. `QRRegistrations`) that holds QR code information. **Each QR code corresponds to one item** in the table. The schema:

* **Primary Key:** `code` – a unique string identifying the QR code. This acts as the short ID present in the QR sticker's URL. Using this as a partition key ensures each code is unique. *(In a similar AWS URL shortener example, a `short_code` primary key uniquely identifies each URL mapping.)*
* **Attributes:**

  * `finalUrl` (String) – The URL to redirect to after registration. Null or empty if not yet assigned.
  * `assigned` (Boolean or a status flag) – Indicates if this code has been registered. Could be derived (e.g. `assigned == true` if `finalUrl` is set).
  * (Optional) `createdAt` (Timestamp) – when the code was generated.
  * (Optional) `registeredAt` (Timestamp) – when the attendee completed registration.
  * (Optional) `attendeeInfo` – any other info from registration (name, etc.), if storing is needed. (The use case mainly needs a redirect URL, so this may not be required unless we want to keep a record of who registered.)

**Uniqueness & One-time Use:** The code (primary key) is inherently unique – DynamoDB will reject any PutItem with a duplicate key. We ensure one-time assignment by only updating a code from "unassigned" to "assigned" once. A conditional update in DynamoDB can enforce that `finalUrl` is not already set when writing the registration, preventing re-use. Once assigned, the code's entry stays in the database (to support redirection forever), and we do **not** delete or reassign it to another user.

### **2. API Gateway Endpoints**

We define a simple REST API (via API Gateway) with endpoints corresponding to the above functions:

* **POST `/generate`** – *Generate a new QR code.*
  **Request:** (admin only) no body needed (or could accept some metadata).
  **Response:** JSON containing the new `code` (e.g. `"code": "ABC123"`) and perhaps the full URL that the QR should point to (e.g. `"url": "https://myapp.com/qr/ABC123"`). This is used by the client to display/print the QR code.
  *(This triggers the GenerateQR Lambda described below.)*

* **POST `/register`** – *Submit registration form data for a given code.*
  **Request:** JSON (or form-data) including the `code` and the form fields (e.g. `name`, `email`, or `desiredUrl`). For example: `{ "code": "ABC123", "name": "Alice", "url": "https://linkedin.com/in/alice" }`.
  **Response:** On success, a confirmation message or the newly assigned `finalUrl`. Could return `{ "status": "OK", "redirectTo": "<finalUrl>" }`. (The client may use this to direct the user or display a success note.)
  *(Invokes the Register Lambda to update DynamoDB.)*

* **GET `/qr/{code}`** – *Handle a QR code scan (redirect logic).*
  **Description:** This endpoint is what the QR code URL actually hits. For example, a QR might encode `https://<domain>/qr/ABC123`. When an attendee scans it, their browser issues a GET request to `/qr/ABC123`, which triggers the Redirect Lambda.
  **Behavior:** The Lambda checks DynamoDB for item with `code=ABC123`.

  * If found **and not yet assigned** (`finalUrl` empty): it returns an HTTP **302 redirect** to the registration page (e.g. redirect to `https://<domain>/register.html?code=ABC123`). This sends first-time scanners to the form.
  * If found **and assigned** (`finalUrl` present): return an HTTP **301 or 302 redirect** directly to the `finalUrl` (the attendee's provided link or profile). This way, the scanner is seamlessly taken to the attendee's info.
  * If not found: return 404 or redirect to a generic error page. (In normal use, codes will always be pre-generated, so this would indicate an invalid code.)

  Using HTTP redirect codes in the Lambda's response ensures the client scanning the QR follows the link automatically. In fact, QR scanner apps and browsers handle **HTTP 302** redirects transparently – the user scanning the code will immediately be taken to the new URL without needing to manually click anything. *(This is how the "dynamic" QR code works: the initial URL points to our service, which then redirects to the real content.)*

These API endpoints are kept simple and stateless, with all persistent data in DynamoDB. API Gateway is configured with **open access** (for demo simplicity). For a real deployment, one would restrict:

* `/generate` and `/register` perhaps behind an admin authentication or API key (since only staff should generate codes, and registration should be rate-limited or protected from abuse).
* `/qr/{code}` should be public (so anyone can scan and be redirected).

*(Note: The vanjs-demo style implies minimal framework and possibly no complex auth; for this design, we assume a trusted environment or would integrate AWS Cognito or API keys as needed.)*

### **3. Lambda Function Logic**

Each API endpoint ties to a Lambda function. We detail each:

* **GenerateQR Lambda:**

  * **Trigger:** POST `/generate` (called by admin interface when printing a new code).
  * **Operation:** Generates a new unique code and inserts a new item into the DynamoDB table with that code.

    * The code can be a short random string (e.g. 6-8 characters alphanumeric). For uniqueness, it can be generated and then checked against DynamoDB (or use DynamoDB's conditional put to avoid duplicates). For example, similar systems use a 6-character mixed-case code, giving \~56 billion possibilities, making collisions unlikely.
    * Store the new item with `code = XYZ123`, and mark it unassigned (no `finalUrl` yet).
  * **Return:** The function returns the generated code (and possibly the full URL path to embed in the QR). For instance, it might return `{"code": "XYZ123", "url": "https://example.com/qr/XYZ123"}`. The admin client will use this to render and print the QR code.
  * **DynamoDB interaction:** `PutItem` to `QRRegistrations` table. We ensure uniqueness by using `ConditionExpression attribute_not_exists(code)` on the put. If it fails (very rare), the lambda can retry with a new code.

* **Register Lambda:**

  * **Trigger:** POST `/register` (called by the registration form submission).
  * **Operation:** Receives the registration data for a given code:

    * Parse the input (likely JSON with `code` and form fields).
    * Lookup the item in DynamoDB (`GetItem` for that code).
    * If not found or already assigned, return an error (the code might be invalid or already used – in our flow this shouldn't happen unless someone reuses an old code).
    * If found and unassigned, update the item with the provided info. Set the `finalUrl` field to the attendee's provided link (or if the form didn't ask for a link but just info, then our system might generate a URL to a profile page and store that). Also set `assigned=true` and perhaps other info (name, etc.).
    * Use a DynamoDB `UpdateItem` with condition `attribute_not_exists(finalUrl)` (or `assigned=false`) to ensure we don't overwrite an existing assignment.
  * **Return:** Could return a success message. The client might then redirect the user to the now-active URL or simply show confirmation. For example, if the form asked the user for a URL to link, the Lambda now has it in `finalUrl` – it can send back that URL or a message like "Registration complete! You can now share your info by this QR code."

    * (Optionally, the lambda could immediately respond with a redirect to the `finalUrl`. However, since this is an API call from XHR, it's easier to return JSON and let the client do `window.location = finalUrl`.)

* **Redirect Lambda:**

  * **Trigger:** GET `/qr/{code}` (when a QR code URL is accessed).
  * **Operation:** Acts like a URL shortener redirect:

    * Read the `{code}` path parameter from the event.
    * Query DynamoDB for that code (`GetItem` by primary key).
    * If item exists and has `finalUrl` set (assigned):
      *Return an HTTP 301 redirect* to the `finalUrl`. In Lambda, this is done by returning a response with statusCode 301 and a "Location" header. The API Gateway will relay that to the client, causing the browser to redirect to the attendee's URL. *(In a referenced AWS example, the Lambda returns statusCode 301 with `Location` header to redirect to the long URL.)*
    * If item exists but no `finalUrl` (not yet registered):
      *Return an HTTP 302 redirect* to the registration page (e.g. a static page on S3) with the code as a query parameter. For instance, Location: `/register.html?code=XYZ123`. This sends the user to the form to complete registration. **Note:** We use 302 (Found) for unregistered so that once they register and the code gets a permanent URL, subsequent scans can be a 301 (permanent) to the final destination. *(QR scanners follow 302 redirects seamlessly, which enables this flow.)*
    * If no item in DB: return 404 or maybe a 302 to a generic error page. (This case should rarely occur if codes are only accessed after generation.)
  * **Return:** No body, just the redirect status and headers. The Lambda's response structure for a redirect looks like:

    ```json
    {
      "statusCode": 302,
      "headers": { "Location": "https://example.com/register.html?code=XYZ123" }
    }
    ```

    as an example for an unassigned code. For an assigned code, `Location` would be the user's URL and perhaps use 301 status.

All Lambdas will have IAM roles permitting them to read/write the DynamoDB table. They are lightweight and only run on-demand (e.g., the redirect lambda runs for a split-second on each scan).

### **4. Static Web Hosting (S3) and Front-End Integration**

The front-end is served from **Amazon S3** as a static website (optionally behind a CloudFront distribution for CDN and TLS). It contains the HTML/JS for two main interfaces:

* The **Admin Interface** (for staff) – to generate and print QR codes.
* The **Registration Interface** (for attendees) – to register their info.

These could be separate pages or a single-page app that shows different views based on URL. We keep them simple and separate for clarity:

**Admin Page (Printer UI):** This page (e.g. `index.html`) allows staff to connect to the Bluetooth printer and generate QR codes:

* Provides a "Connect Printer" button that uses the Web Bluetooth API to pair with a nearby thermal printer.
* Provides a "New QR Code" button:

  * On click, it calls the **`POST /generate`** API (via `fetch` or XHR).
  * Receives the new code and URL from the backend.
  * The front-end then creates a QR code image or command. Since we want to print it, the page can:

    * Use a JS library to generate a QR code image (e.g. create a canvas or SVG representing the QR for the URL).
    * Or directly use the printer's command language to print the QR (see below).
  * Send the print job to the printer via Web Bluetooth.
  * Optionally display the QR code on screen as well (for verification).
* The page might also show a history of codes or an option to invalidate/regenerate if needed (not required by use case though).

**Registration Page (Attendee UI):** This page (e.g. `register.html`) hosts the form that attendees fill out:

* When loaded, it reads the `code` from the URL query param (e.g. `?code=XYZ123`). The page's JS could verify the code's status by calling an API (like GET `/qr/XYZ123/status` if we had one, or reuse the redirect lambda in a special way). However, since the Redirect Lambda already sent them here only if the code was unassigned, we can assume it's valid and needs registering.
* It displays a form (for example: Name, Email, and an input for "Link to share" which could be a personal URL or profile). This form is kept minimal.
* On submission (form submit event), the JS captures the data and sends a **POST** to `/<register>` API with the `code` and form fields (likely via AJAX to avoid page reload).
* If the API call succeeds (registration lambda returns OK):

  * The page can either show a success message like "Registration complete! You can now share your info by this QR code."
  * Or automatically redirect the user to the `finalUrl` they provided (for instance, if they entered their LinkedIn, the app might just send them there as confirmation).
  * Subsequent scans of the same QR by anyone will now go straight to that final URL.
* Basic validation can be done (e.g., require non-empty name or a valid URL format if needed).

**Web Bluetooth Printing:** The admin interface uses the Web Bluetooth API to communicate with the thermal printer. Printing involves sending raw bytes that represent the QR code in the printer's language (typically ESC/POS commands for receipt printers). **ESC/POS** is a common protocol for thermal printers. The client's JS either manually constructs these commands or uses a library:

* We can use a library like **WebBluetoothReceiptPrinter** along with a **ReceiptPrinterEncoder**. For example, the ReceiptPrinterEncoder can take text or a URL and encode a QR code in ESC/POS bytes, which the WebBluetooth library then sends to the device. *This approach builds the print content (including the QR graphic) as an array of bytes in the ESC/POS format, which can then be sent via a Bluetooth GATT connection.*
* Alternatively, the client can generate a QR code image (bitmap) in JS and send it to the printer as an image. Many ESC/POS printers support printing bitmaps, but printing a QR via native commands is typically more efficient and produces a crisp code.
* **Generic Printer Support:** The solution should support generic Bluetooth thermal printers – most of these either implement Bluetooth Serial Port Profile or Bluetooth LE with GATT. Using Web Bluetooth, the site can discover devices advertising the printer service. The printing logic might need to know the correct service and characteristic to write to (which the library can handle). Usually, for BLE printers, a specific service UUID is used for receiving print data.
* **Printing QR Code:** ESC/POS supports QR code printing via commands or by printing a stored image. The chosen method here is to leverage the printer's built-in QR command. For instance, using the library's encoder: `encoder.qrcode("https://myapp.com/qr/XYZ123").encode()` would append the proper bytes to print a QR symbol containing that URL. (From the library's examples, `.qrcode('https://...')` is used to add a QR code to the print data.)
* **No Driver Needed:** This in-browser approach means we don't need any native driver; it's purely web tech. As one reference notes, it's possible to send **formatted text, images, barcodes, and QR codes** from a web app to a Bluetooth printer without deep knowledge of ESC/POS by using a conversion library. *In other words, the client code can be kept simple by using an abstraction that handles the ESC/POS command generation for QR codes.*
* **User Interaction:** The browser will prompt the user to select a Bluetooth device when connecting (for security, Web Bluetooth requires a user gesture to initiate pairing). After pairing, the app can remember or attempt reconnect on future uses (some APIs allow remembering devices with permission).

**Printing Workflow Example:**

1. Staff clicks **Connect Printer** – the browser shows a device chooser, they select their thermal printer. The app connects and prepares for printing.
2. Staff clicks **New QR Code** – the app calls `/generate`, gets back code "XYZ123".
3. The app uses a JS QR library or ESC/POS encoder to create print data for "XYZ123". It may also include a text label (like "Scan to register") below the QR image.
4. The app sends the data via the Bluetooth GATT connection to the printer. The printer prints the QR sticker.
5. Staff attaches sticker to badge. Done.

*(Web Bluetooth printing is supported in modern Chromium-based browsers on desktop and Android; iOS Safari has limitations with Web Bluetooth, so that's a consideration if needed.)*

## **Putting it Together: Flow Summary**

* **Admin (Staff) Flow:**

  1. Load admin page (from S3) – perhaps login (if protected) – and connect printer.
  2. Click "Print QR" for each attendee:

     * Front-end calls **GenerateQR API** → Lambda creates DB record → returns code.
     * Front-end receives code and prints the QR via Bluetooth.
  3. Sticker (with URL `.../qr/XYZ123`) is given to attendee.
* **Attendee Flow (First Scan):**

  1. Attendee scans QR `XYZ123` → opens `https://app/qr/XYZ123`.
  2. **Redirect Lambda** checks DynamoDB:

     * finds code unassigned → returns **302** redirect to `register.html?code=XYZ123`.
  3. Attendee's browser follows redirect to registration page (static S3 content).
  4. Registration page JS reads the code and lets attendee fill form. They submit.
  5. Front-end calls **Register API** → Lambda updates DynamoDB (sets finalUrl).
  6. Lambda responds, front-end confirms registration (could navigate to finalUrl or show message).
* **Attendee Flow (Subsequent Scans by anyone):**

  1. Any device scans the same QR `XYZ123` (now with finalUrl in DB).
  2. **Redirect Lambda** finds code assigned with `finalUrl` → returns **301** redirect to that URL.
  3. Scanner's browser goes straight to the attendee's info link (for example, their LinkedIn or a profile page).
* **Re-registration:** If an attendee needs a new registration (say their info changed or they lost the old QR), the staff issues a **new code** (repeat admin flow). The old code remains in the system (it will still redirect to the old info, unless manually disabled). This ensures each QR code is one-time assignable and history is preserved.

## **Minimal Technology Stack (React.js Front-End)**

This design builds upon the existing React.js frontend architecture in the vanjs-demo repository, while focusing on maintainability and readability:

* Use React's **Fetch API** or Axios for interacting with the API endpoints
* Utilize React hooks and components to create a responsive UI for QR code generation and printing
* Implement Web Bluetooth API integration through React components


* **Size & Performance:** While React adds some bundle size, Create React App's production builds include code splitting and optimization. The static assets are served from S3/CloudFront, ensuring fast load times.
* **Scalability:** The static content can be cached globally via CloudFront. The API (Lambda/DynamoDB) scales automatically—capable of handling many registrations/scans concurrently.
* **Cost:** The serverless model means you pay only for actual usage (Lambda invocations, DynamoDB storage and R/W units, API Gateway calls). If the conference is occasional, costs remain low (no running servers).

## **Conclusion**

This solution provides a **scalable, easy-to-deploy** system for managing conference attendee QR codes with one-time registration. By leveraging AWS serverless services, we avoid maintaining servers and achieve high reliability and scalability out-of-the-box. The use of DynamoDB ensures each QR code is unique and the redirect mappings can be performed in constant time. The architecture mimics the simplicity of the vanjs-demo app – static front-end and serverless backend – keeping the design cloud-native and minimal.

Finally, the integration of Web Bluetooth for printing enables a fully self-contained workflow: organizers can print QR stickers on the spot through a web browser interface, without any special software. This demonstrates the power of modern web APIs combined with cloud services to solve a real-world use case in a serverless, user-friendly manner.

