# QR Code Registration System - Frontend Implementation

## Project Overview

This document outlines the frontend implementation plan for the QR Code Registration System based on the requirements in `design.md`. The system will allow conference organizers to generate QR codes for attendee badges and enable a one-time registration flow.

## Core Functionality 

The frontend consists of two main interfaces:

1. **Admin Interface** (`index.html/js`)
   - Generate unique QR codes
   - Connect to Bluetooth thermal printers
   - Print QR codes on badge stickers

2. **Registration Interface** (`registration.html/js`)
   - Process QR code scans
   - Present registration form to attendees
   - Submit data to backend API
   - Show confirmation/success message

## Technical Approach

### Technology Stack
- **Framework**: Vanilla JavaScript (no framework)
- **QR Generation**: Client-side using `qrcode.min.js`
- **Printing**: Web Bluetooth API for thermal printer communication
- **API Communication**: Fetch API (with hardcoded responses for initial development)
- **Styling**: Custom CSS with design token implementation

### Minimalist Implementation

For the initial iteration, we'll focus on the bare minimum functionality:

1. **Admin Interface**:
   - Generate QR codes directly in the browser
   - Basic printer connection via Web Bluetooth
   - Simple print function for QR codes

2. **Registration Interface**:
   - Extract code from URL parameters
   - Simple form with minimal fields (name, URL)
   - Success confirmation after submission

### Color Palette

The application will use a strict color palette with these design tokens:

- **#01D101** — Bright Green — Primary action buttons, success indicators
- **#62D197** — Soft Green — Section backgrounds, card accents, form focus states
- **#1F2729** — Dark Slate — Page background, contrast areas
- **#FF8E04** — Orange — Highlights, warnings, attention elements (used sparingly)

## Implementation Plan

### Project Structure
```
/frontend
  /index.html     - Admin interface
  /index.js       - Admin interface logic
  /registration.html - Registration form
  /registration.js   - Registration form logic
  /style.css      - Styling with color palette implementation
  /qrcode.min.js  - QR code generation library
```

### Admin Interface Implementation
- Simple UI with "Connect Printer" and "Generate QR" buttons
- Client-side QR code generation
- Basic Web Bluetooth implementation
- Minimal ESC/POS command support for QR printing

### Registration Interface Implementation
- URL parameter extraction for QR code
- Simple form with name and URL fields
- Submission handler with success message
- Redirect to provided URL after successful registration

### Testing Approach
- Limited E2E browser tests focusing on core user flows:
  1. QR code generation test
  2. Registration form submission test

## Next Steps

1. Set up basic HTML/CSS structure based on the sample folder
2. Implement client-side QR generation
3. Add Web Bluetooth connectivity for printers
4. Create form submission logic
5. Implement CSS with the defined color palette
6. Write minimal E2E tests for core functionality
7. Refine UI based on testing

## Future Enhancements (Post-MVP)

1. Improve printer compatibility with more ESC/POS commands
2. Add proper error handling and recovery flows
3. Implement actual API integration (replacing hardcoded responses)
4. Add device reconnection and caching for better printer experience
5. Enhance QR code customization options 