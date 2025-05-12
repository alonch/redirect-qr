document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const connectPrinterBtn = document.getElementById("connect-printer")
  const generateQrBtn = document.getElementById("generate-qr")
  const printQrBtn = document.getElementById("print-qr")
  const printerStatusText = document.getElementById("printer-status-text")
  const printerIndicator = document.getElementById("printer-indicator")
  const qrPreview = document.getElementById("qr-preview")
  const qrCodeDisplay = document.getElementById("qr-code-display")
  const qrCodeValue = document.getElementById("qr-code-value")
  const qrUrlValue = document.getElementById("qr-url-value")

  // State
  let bluetoothDevice = null
  let bluetoothCharacteristic = null
  let currentQrCode = null
  let currentQrUrl = null
  let bitmapData = null

  // === CONSTANTS ===
  const PRINTER_DPI = 203;
  const PRINTER_LABEL_WIDTH_MM = 54;
  const PRINTER_BITMAP_WIDTH = 400;
  const PRINTER_BITMAP_HEIGHT = 200;
  const QR_CODE_SIZE = 160;

  // Create a queue for Bluetooth operations
  const bleQueue = {
    queue: [],
    busy: false,
    
    // Add an operation to the queue
    enqueue: function(operation) {
      return new Promise((resolve, reject) => {
        this.queue.push({
          operation: operation,
          resolve: resolve,
          reject: reject
        });
        this.process();
      });
    },
    
    // Process the next operation in the queue
    process: async function() {
      if (this.busy || this.queue.length === 0) {
        return;
      }
      
      this.busy = true;
      const item = this.queue.shift();
      
      try {
        // Execute the operation and pass the result to the promise
        const result = await item.operation();
        item.resolve(result);
      } catch (error) {
        // If operation fails, reject the promise
        item.reject(error);
      } finally {
        this.busy = false;
        // Add a small delay before processing the next operation
        setTimeout(() => this.process(), 1);
      }
    }
  };

  // Helper function to send data with proper chunking and delays
  async function sendData(data) {
    // Use the BLE queue to ensure operations are sequential
    return bleQueue.enqueue(async () => {
      try {
        logDebug(`Sending ${data.byteLength} bytes...`);
        
        // For debugging: show first few bytes in hex
        const firstBytes = Array.from(data.slice(0, Math.min(10, data.length)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        logDebug(`Command bytes: ${firstBytes}...`);
        
        // Split data into smaller chunks if it's large
        if (data.byteLength > 120) {
          logDebug("Large packet detected, splitting into smaller chunks");
          const chunkSize = 120; // Based on what worked in diagnostic.html
          
          for (let i = 0; i < data.byteLength; i += chunkSize) {
            const end = Math.min(i + chunkSize, data.byteLength);
            const chunk = data.slice(i, end);
            
            logDebug(`Sending sub-chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(data.byteLength/chunkSize)}: ${chunk.byteLength} bytes`);
            await bluetoothCharacteristic.writeValue(chunk);
            
            // Add a delay between each sub-chunk write
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          
          logDebug(`All sub-chunks sent successfully`);
          return true;
        } else {
          // Send small packets directly
          await bluetoothCharacteristic.writeValue(data);
          
          // Short delay to ensure commands are processed
          await new Promise(resolve => setTimeout(resolve, 300));
          logDebug(`Sent ${data.byteLength} bytes successfully`);
          return true;
        }
      } catch (error) {
        console.error("Error sending data:", error);
        logDebug(`Error sending data: ${error.message}`);
        throw error;
      }
    });
  }

  // Enable Generate QR button by default for testing
  generateQrBtn.disabled = false

  // Debug logging function
  function logDebug(message, data) {
    console.log(`%c${message}`, 'color: green; font-weight: bold', data || '');
  }

  // Check if Web Bluetooth is supported
  if (!navigator.bluetooth) {
    printerStatusText.textContent = "Bluetooth not supported - QR generation still available"
    connectPrinterBtn.disabled = true
    return
  }

  // Connect to NETUM G5 Bluetooth printer
  connectPrinterBtn.addEventListener("click", async () => {
    try {
      // Request device with specific filter for the NETUM G5 printer
      logDebug("Requesting Bluetooth device...");
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        // Filter specifically for G5 printers and the service we know works
        filters: [
          { namePrefix: "G5-" },  // Filter for NETUM G5 printer names
          { services: ["49535343-fe7d-4ae5-8fa9-9fafd205e455"] } // The printer's specific service
        ],
        optionalServices: [
          '0000180a-0000-1000-8000-00805f9b34fb', // Device Information service
          '00001800-0000-1000-8000-00805f9b34fb', // Generic Access service
          '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute service
          '0000180f-0000-1000-8000-00805f9b34fb', // Battery service
          '0000ffe0-0000-1000-8000-00805f9b34fb'  // Common vendor-specific service
        ]
      });

      logDebug("Selected device:", bluetoothDevice);
      printerStatusText.textContent = "Connecting...";

      // Connect to the device
      const server = await bluetoothDevice.gatt.connect();
      logDebug("Connected to GATT server");

      // Get the service we know works with this printer
      const service = await server.getPrimaryService("49535343-fe7d-4ae5-8fa9-9fafd205e455");
      logDebug("Connected to service:", service.uuid);
      
      // Get the writable characteristic we discovered works
      bluetoothCharacteristic = await service.getCharacteristic("49535343-8841-43f4-a8d4-ecbe34729bb3");
      logDebug("Connected to characteristic:", bluetoothCharacteristic.uuid);

      // Update UI to show connected state
      printerStatusText.textContent = `Connected to ${bluetoothDevice.name}`;
      printerIndicator.classList.remove("disconnected");
      printerIndicator.classList.add("connected");
      connectPrinterBtn.textContent = "Disconnect Printer";
      printQrBtn.disabled = false;

      // Listen for disconnection
      bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);
    } catch (error) {
      console.error("Bluetooth connection error:", error);
      printerStatusText.textContent = "Connection failed: " + error.message;
    }
  });

  // Handle disconnection
  function onDisconnected() {
    printerStatusText.textContent = "Printer disconnected";
    printerIndicator.classList.remove("connected");
    printerIndicator.classList.add("disconnected");
    connectPrinterBtn.textContent = "Connect Printer";
    printQrBtn.disabled = true;
    bluetoothDevice = null;
    bluetoothCharacteristic = null;
  }

  // Generate QR Code
  generateQrBtn.addEventListener("click", async () => {
    try {
      // Show loading state
      generateQrBtn.disabled = true;
      generateQrBtn.textContent = "Generating...";

      // For testing purposes, create a mock QR code
      const mockCode = "TEST" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const data = { code: mockCode };
      
      // Store the QR code data
      currentQrCode = data.code;
      currentQrUrl = `${window.location.origin}/qr-system/registration.html?code=${data.code}`;

      // Generate QR code
      if (!generateQrCodeImage(currentQrUrl)) {
        throw new Error("Failed to generate QR code image");
      }

      // Update the info text
      qrCodeValue.textContent = currentQrCode;
      qrUrlValue.textContent = currentQrUrl;

      // Show the preview section
      qrPreview.classList.remove("hidden");

      // Enable print button if printer is connected
      if (bluetoothCharacteristic) {
        printQrBtn.disabled = false;
      }

      // Reset button state
      generateQrBtn.disabled = false;
      generateQrBtn.textContent = "Generate QR Code";
    } catch (error) {
      console.error("Error generating QR code:", error);
      
      generateQrBtn.disabled = false;
      generateQrBtn.textContent = "Generate QR Code";
    }
  });

  // Generate QR code image and prepare bitmap data
  function generateQrCodeImage(url) {
    try {
      // Get canvas for QR code
      const qrCanvas = document.getElementById("qr-code-display");
      
      // Set the canvas size to our desired dimensions
      qrCanvas.width = PRINTER_BITMAP_WIDTH;
      qrCanvas.height = PRINTER_BITMAP_HEIGHT;
      
      // Get canvas context and fill with white background
      const ctx = qrCanvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
      
      // Make sure temp container is removed if it exists
      const existingTempContainer = document.getElementById("temp-qr-container");
      if (existingTempContainer) {
        existingTempContainer.remove();
      }
      
      // Try generating QR code with different libraries
      if (typeof QRCode === 'function') {
        logDebug("Using qrcodejs library");
        
        // Create a temporary div container for QR code (positioned off-screen)
        const tempDiv = document.createElement('div');
        tempDiv.style.backgroundColor = "white";
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.id = "temp-qr-container";
        document.body.appendChild(tempDiv);
        
        // Generate QR code in the temporary container
        new QRCode(tempDiv, {
          text: url,
          width: QR_CODE_SIZE,
          height: QR_CODE_SIZE,
          colorDark: "#000000",
          colorLight: "#FFFFFF",
        });
        
        // Get the canvas from QR code
        const canvasQr = tempDiv.querySelector('canvas');
        if (canvasQr) {
          // Center the QR code on our main canvas
          const xOffset = (PRINTER_BITMAP_WIDTH - QR_CODE_SIZE) / 2;
          const yOffset = (PRINTER_BITMAP_HEIGHT - QR_CODE_SIZE) / 2;
          ctx.drawImage(canvasQr, xOffset, yOffset);
          
          // Create bitmap data from the canvas with centered QR code
          if (createBitmapData(qrCanvas)) {
            logDebug("QR code bitmap created successfully");
            
            // Clean up - remove temporary div
            document.body.removeChild(tempDiv);
            return true;
          } else {
            logDebug("QR code generated but bitmap creation failed");
            // Continue to try other methods
          }
        } else {
          logDebug("QR code generated but no canvas found");
          // Continue to try other methods
        }
        
        // Clean up even if failed
        document.body.removeChild(tempDiv);
      } 
      
      // Try node-qrcode library if available and previous method failed
      if (typeof QRCode === 'object' && QRCode.toCanvas) {
        logDebug("Using node-qrcode library");
        
        // Create an intermediate canvas for the QR code only
        const qrOnlyCanvas = document.createElement('canvas');
        qrOnlyCanvas.width = QR_CODE_SIZE;
        qrOnlyCanvas.height = QR_CODE_SIZE;
        
        // Generate QR code on the intermediate canvas
        return QRCode.toCanvas(qrOnlyCanvas, url, {
          width: QR_CODE_SIZE,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        }).then(() => {
          // Now draw this QR code centered on our main canvas
          const xOffset = (PRINTER_BITMAP_WIDTH - QR_CODE_SIZE) / 2;
          const yOffset = (PRINTER_BITMAP_HEIGHT - QR_CODE_SIZE) / 2;
          ctx.drawImage(qrOnlyCanvas, xOffset, yOffset);
          
          // Create bitmap data
          if (createBitmapData(qrCanvas)) {
            logDebug("QR code bitmap created successfully with node-qrcode");
            return true;
          } else {
            logDebug("QR code generated with node-qrcode but bitmap creation failed");
            return false;
          }
        }).catch(error => {
          logDebug("Error generating QR code with node-qrcode:", error);
          return false;
        });
      }
      
      // If we reached here, neither method worked, use fallback
      logDebug("Using fallback method for QR code generation");
      
      // No QR library available - fallback
      ctx.fillStyle = "black";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("QR Code:", PRINTER_BITMAP_WIDTH / 2, PRINTER_BITMAP_HEIGHT / 2 - 40);
      ctx.fillText(url, PRINTER_BITMAP_WIDTH / 2, PRINTER_BITMAP_HEIGHT / 2);
      ctx.fillText("QR Library not available", PRINTER_BITMAP_WIDTH / 2, PRINTER_BITMAP_HEIGHT / 2 + 40);
      
      // Create fallback bitmap
      createFallbackBitmap();
      // Even though we're using fallback, return true so we don't throw an error
      // The user will see a message in the QR code area
      return true;
    } catch (error) {
      console.error("Error generating QR code image:", error);
      
      // Make sure canvas is visible
      const qrCanvas = document.getElementById("qr-code-display");
      if (qrCanvas) {
        // Draw error message on canvas
        const ctx = qrCanvas.getContext('2d');
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
        
        ctx.fillStyle = "black";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Error generating QR code", PRINTER_BITMAP_WIDTH / 2, PRINTER_BITMAP_HEIGHT / 2 - 20);
        ctx.fillText(error.message, PRINTER_BITMAP_WIDTH / 2, PRINTER_BITMAP_HEIGHT / 2 + 20);
      }
      
      // Create fallback bitmap
      createFallbackBitmap();
      // Return true to prevent error throwing, user will see the error in the UI
      return true;
    }
  }
  
  // Create bitmap data from canvas
  function createBitmapData(canvas) {
    try {
      if (!canvas) {
        logDebug("No canvas provided for bitmap creation");
        return false;
      }
      
      // Get canvas data
      const context = canvas.getContext('2d');
      if (!context) {
        logDebug("Could not get canvas context");
        return false;
      }
      
      try {
        const imageData = context.getImageData(0, 0, PRINTER_BITMAP_WIDTH, PRINTER_BITMAP_HEIGHT);
        const pixelData = imageData.data;
        
        // Set up bitmap data
        const width = PRINTER_BITMAP_WIDTH;
        const height = PRINTER_BITMAP_HEIGHT;
        const widthBytes = Math.ceil(width / 8);
        
        // Create bitmap array
        bitmapData = new Uint8Array(widthBytes * height);
        bitmapData.fill(0); // Clear bitmap data
        
        // Convert pixel data to bitmap format
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pixelIndex = (y * width + x) * 4;
            // Get pixel brightness (0-255)
            const brightness = (pixelData[pixelIndex] + pixelData[pixelIndex + 1] + pixelData[pixelIndex + 2]) / 3;
            // Set bit if pixel is dark (black)
            if (brightness < 128) {
              const byteIndex = y * widthBytes + Math.floor(x / 8);
              const bitIndex = 7 - (x % 8); // MSB first - standard for printers
              bitmapData[byteIndex] |= (1 << bitIndex);
            }
          }
        }
        
        logDebug("Bitmap data created successfully", bitmapData.byteLength);
        return true;
      } catch (pixelError) {
        logDebug("Error accessing pixel data: " + pixelError.message);
        return false;
      }
    } catch (error) {
      console.error("Error creating bitmap data:", error);
      return false;
    }
  }
  
  // Create a fallback bitmap pattern (checkerboard)
  function createFallbackBitmap() {
    // Create simple pattern bitmap data
    const widthBytes = Math.ceil(PRINTER_BITMAP_WIDTH / 8);
    const heightPx = PRINTER_BITMAP_HEIGHT;
    bitmapData = new Uint8Array(widthBytes * heightPx);
    
    // Create a checkerboard pattern
    for (let y = 0; y < heightPx; y++) {
      for (let x = 0; x < PRINTER_BITMAP_WIDTH; x++) {
        if ((x + y) % 16 < 8) { // Checkerboard 8x8 pixel squares
          const byteIndex = y * widthBytes + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          bitmapData[byteIndex] |= (1 << bitIndex);
        }
      }
    }
    
    logDebug("Created fallback bitmap pattern", bitmapData.byteLength);
  }

  // Print QR Code
  printQrBtn.addEventListener("click", async () => {
    if (!bluetoothCharacteristic || !currentQrCode) {
      return;
    }

    try {
      printQrBtn.disabled = true;
      printQrBtn.textContent = "Printing...";
      
      // If bitmap data is not available, try to create it from the current QR code
      if (!bitmapData) {
        const canvas = document.querySelector("#qr-code-display");
        if (canvas) {
          createBitmapData(canvas);
        } else {
          // Try to find canvas in a QR code container
          const canvasInQr = document.querySelector("#temp-qr-container canvas");
          if (canvasInQr) {
            createBitmapData(canvasInQr);
          } else {
            createFallbackBitmap();
          }
        }
      }
      
      if (!bitmapData) {
        throw new Error("Could not create bitmap data for printing");
      }
      
      // Get bitmap dimensions
      const width = PRINTER_BITMAP_WIDTH;
      const height = PRINTER_BITMAP_HEIGHT;
      const widthBytes = Math.ceil(width / 8);
      
      logDebug(`Printing bitmap: ${width}x${height} (${widthBytes} bytes per row)`);
      
      // 1. Initialize printer
      logDebug("Sending initialization command...");
      await sendData(new Uint8Array([0x1B, 0x40]));
      
      // 2. Text content - just send the text directly
      logDebug("Sending header text...");
      const encoder = new TextEncoder();
      const textContent = encoder.encode(`\n\nConference Registration\nCode: ${currentQrCode}\n\n`);
      await sendData(textContent);
      
      // 3. Process the bitmap in chunks 
      logDebug("Processing bitmap data...");
      
      // We need to split the data into chunks because of the 512-byte Bluetooth limit
      // Calculate how many rows we can safely send in each chunk
      const MAX_CHUNK_SIZE = 350; // Optimized value from diagnostic.html
      const HEADER_SIZE = 7; // GS v 0 header is 7 bytes
      const maxBytesPerChunk = MAX_CHUNK_SIZE - HEADER_SIZE;
      const rowsPerChunk = Math.max(1, Math.floor(maxBytesPerChunk / widthBytes));
      
      logDebug(`Splitting into chunks with max ${rowsPerChunk} rows per chunk`);
      
      // Process the bitmap in chunks
      for (let startRow = 0; startRow < height; startRow += rowsPerChunk) {
        // Calculate the number of rows in this chunk
        const rowsInThisChunk = Math.min(rowsPerChunk, height - startRow);
        
        // Build GS v 0 command header for this chunk
        const chunkWidth = widthBytes;
        const chunkHeight = rowsInThisChunk;
        
        const xL = chunkWidth & 0xFF;
        const xH = (chunkWidth >> 8) & 0xFF;
        const yL = chunkHeight & 0xFF;
        const yH = (chunkHeight >> 8) & 0xFF;
        
        const commandHeader = new Uint8Array([
          0x1D, 0x76, 0x30,  // GS v 0 command prefix
          0,                 // Mode 0 (normal)
          xL, xH,            // Width in bytes (low, high)
          yL, yH             // Height in dots (low, high)
        ]);
        
        // Extract bitmap data for this chunk
        const startByte = startRow * widthBytes;
        const endByte = startByte + (chunkHeight * widthBytes);
        const chunkData = bitmapData.slice(startByte, endByte);
        
        // Combine command header with chunk data
        const chunk = new Uint8Array(commandHeader.length + chunkData.length);
        chunk.set(commandHeader, 0);
        chunk.set(chunkData, commandHeader.length);
        
        // Send this chunk
        logDebug(`Sending chunk ${Math.floor(startRow/rowsPerChunk) + 1}: ${chunkData.length} bytes (rows ${startRow+1}-${startRow+chunkHeight})`);
        await sendData(chunk);
        
        // Add a delay between chunks to let the printer process
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 4. Send final line feeds and cut command
      logDebug("Sending line feeds and cut command...");
      await sendData(new Uint8Array([0x1B, 0x64, 0x04])); // Feed 4 lines
      await sendData(new Uint8Array([0x1D, 0x56, 0x00])); // GS V 0 - Full cut
      
      // Update UI
      printQrBtn.textContent = "Print QR Code";
      printQrBtn.disabled = false;
      
      // Show success message
      
    } catch (error) {
      console.error("Error printing QR code:", error);
      
      printQrBtn.textContent = "Print QR Code";
      printQrBtn.disabled = false;
    }
  });
});

// The QRCode library will be loaded via the script tag in the HTML
