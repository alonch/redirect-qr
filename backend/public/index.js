document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const connectPrinterBtn = document.getElementById("connect-printer")
  const generatePrintQrBtn = document.getElementById("generate-print-qr")
  const printerStatusText = document.getElementById("printer-status-text")
  const printerIndicator = document.getElementById("printer-indicator")
  const qrPreview = document.getElementById("qr-preview")
  const qrCodeDisplay = document.getElementById("qr-code-display")
  const qrCodeValue = document.getElementById("qr-code-value")
  const qrUrlValue = document.getElementById("qr-url-value")
  const printQuantitySlider = document.getElementById("print-quantity")
  const quantityValueDisplay = document.getElementById("quantity-value")

  // State
  let bluetoothDevice = null
  let bluetoothCharacteristic = null
  let currentQrCode = null
  let currentQrUrl = null
  let bitmapData = null
  let printQuantity = 1 // Default to 1 copy

  // Update quantity display when slider changes
  printQuantitySlider.addEventListener("input", () => {
    printQuantity = parseInt(printQuantitySlider.value)
    quantityValueDisplay.textContent = printQuantity
  })

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
  generatePrintQrBtn.disabled = false

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
      generatePrintQrBtn.disabled = false;

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
    generatePrintQrBtn.disabled = true;
    bluetoothDevice = null;
    bluetoothCharacteristic = null;
  }

  // Combined Generate and Print QR Code
  generatePrintQrBtn.addEventListener("click", async () => {
    try {
      // Show loading state
      generatePrintQrBtn.disabled = true;
      generatePrintQrBtn.textContent = "Processing...";

      // Step 1: Generate the QR code
      // Use the backend API to generate a QR code
      const response = await fetch('/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate QR code: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store the QR code data
      currentQrCode = data.code;
      currentQrUrl = data.url;

      // Generate QR code
      if (!generateQrCodeImage(currentQrUrl)) {
        throw new Error("Failed to generate QR code image");
      }

      // Update the info text
      qrCodeValue.textContent = currentQrCode;
      qrUrlValue.textContent = currentQrUrl;

      // Show the preview section
      qrPreview.classList.remove("hidden");

      // Step 2: Print the QR code if printer is connected
      if (bluetoothCharacteristic) {
        try {
          generatePrintQrBtn.textContent = `Printing ${printQuantity} ${printQuantity > 1 ? 'copies' : 'copy'}...`;
          
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
          
          // Print the requested number of copies
          for (let copyNum = 1; copyNum <= printQuantity; copyNum++) {
            if (printQuantity > 1) {
              generatePrintQrBtn.textContent = `Printing copy ${copyNum} of ${printQuantity}...`;
            }
            
            // Get bitmap dimensions
            const width = PRINTER_BITMAP_WIDTH;
            const height = PRINTER_BITMAP_HEIGHT;
            const widthBytes = Math.ceil(width / 8);
            
            logDebug(`Printing bitmap copy ${copyNum}: ${width}x${height} (${widthBytes} bytes per row)`);
            
            // 1. Initialize printer
            logDebug("Sending initialization command...");
            await sendData(new Uint8Array([0x1B, 0x40]));
            
            // 2. Text content - just send the text directly
            logDebug("Sending header text...");
            const encoder = new TextEncoder();
            const textContent = encoder.encode(`\n\nConnect with me\non LinkedIn\nCode: ${currentQrCode}\nCreated by\nRealsense\n  Solutions\n\n* this app was vibe coded in 6 hours *\n`);
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
            
            // Add a short delay between copies
            if (copyNum < printQuantity) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } catch (printError) {
          console.error("Error printing QR code:", printError);
          // We still show the QR code even if printing fails
        }
      } else {
        logDebug("Printer not connected, generated QR code only");
      }

      // Reset button state
      generatePrintQrBtn.disabled = false;
      generatePrintQrBtn.textContent = "Generate & Print QR Code";
    } catch (error) {
      console.error("Error generating/printing QR code:", error);
      
      generatePrintQrBtn.disabled = false;
      generatePrintQrBtn.textContent = "Generate & Print QR Code";
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
          // Position the QR code on the right side of the canvas with better alignment
          const rightOffset = PRINTER_BITMAP_WIDTH - QR_CODE_SIZE - 40; // Increased padding for more space
          const yOffset = (PRINTER_BITMAP_HEIGHT - QR_CODE_SIZE) / 2;
          ctx.drawImage(canvasQr, rightOffset, yOffset);
          
          // Add text on the left side
          addTextToCanvas(ctx, yOffset);
          
          // Create bitmap data from the canvas with QR code and text
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
          // Position the QR code on the right side of the canvas with better alignment
          const rightOffset = PRINTER_BITMAP_WIDTH - QR_CODE_SIZE - 60; // Increased padding for more space
          const yOffset = (PRINTER_BITMAP_HEIGHT - QR_CODE_SIZE) / 2;
          ctx.drawImage(qrOnlyCanvas, rightOffset, yOffset);
          
          // Add text on the left side
          addTextToCanvas(ctx, yOffset);
          
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
  
  // Function to add text to the canvas
  function addTextToCanvas(ctx, qrYOffset) {
    const leftPadding = 30; // Reduced left padding to increase space between text and QR
    
    // Set text styling - only black for thermal printer compatibility
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    
    // Calculate vertical center based on QR code position
    const verticalCenter = qrYOffset + QR_CODE_SIZE/2;
    const lineHeight = 30; // Slightly increased for better spacing with larger icon
    
    // Draw first part of the text - aligned with top half of QR code
    ctx.font = "bold 20px Inter"; // Reduced font size
    ctx.fillText("Connect with me", leftPadding, verticalCenter - lineHeight*2);
    
    // Draw LinkedIn icon - LARGER VERSION
    const iconSize = 30; // Increased from 16 to 22
    const iconX = leftPadding;
    const iconY = verticalCenter - lineHeight - 6; // Adjusted for better spacing below "Connect with me"
    
    // Draw LinkedIn icon (simplified version)
    ctx.save();
    
    // Draw icon background (rounded square)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    const radius = 4; // Corner radius (increased slightly)
    ctx.moveTo(iconX + radius, iconY);
    ctx.lineTo(iconX + iconSize - radius, iconY);
    ctx.quadraticCurveTo(iconX + iconSize, iconY, iconX + iconSize, iconY + radius);
    ctx.lineTo(iconX + iconSize, iconY + iconSize - radius);
    ctx.quadraticCurveTo(iconX + iconSize, iconY + iconSize, iconX + iconSize - radius, iconY + iconSize);
    ctx.lineTo(iconX + radius, iconY + iconSize);
    ctx.quadraticCurveTo(iconX, iconY + iconSize, iconX, iconY + iconSize - radius);
    ctx.lineTo(iconX, iconY + radius);
    ctx.quadraticCurveTo(iconX, iconY, iconX + radius, iconY);
    ctx.closePath();
    ctx.fill();
    
    // Draw the letter "in" in white
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px Arial"; // Increased from 11 to 14
    ctx.fillText("in", iconX + 6, iconY + iconSize - 6); // Adjusted positioning
    
    ctx.restore();
    
    // Add "on" text
    ctx.fillStyle = "#000000";
    ctx.font = "16px Inter";
    const textY = iconY + iconSize/2 + 5; // Save vertical position for consistent alignment
    ctx.fillText("on", iconX + iconSize + 8, textY);
    
    // Add LinkedIn text after "on" with space
    ctx.font = "bold 16px Inter"; // Make LinkedIn bold
    const onText = "on ";
    const onTextWidth = ctx.measureText(onText).width;
    ctx.fillText("LinkedIn", iconX + iconSize + 8 + onTextWidth, textY);
    
    // Add the decorative line
    ctx.strokeStyle = "#000000"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftPadding, verticalCenter);
    ctx.lineTo(leftPadding + 150, verticalCenter); // Shortened line
    ctx.stroke();
    
    // Draw second part with "Created by" text - aligned with bottom half of QR code
    ctx.font = "bold 20px Inter"; // Reduced font size
    ctx.fillText("Created by", leftPadding, verticalCenter + lineHeight - 5); // Adjusted spacing
    
    // Draw "Realsense" on first line
    ctx.font = "bold 22px Inter"; // Reduced font size
    ctx.fillText("Realsense", leftPadding, verticalCenter + lineHeight*2 - 10); // Adjusted spacing
    
    // Draw "Solutions" on second line, indented
    ctx.fillText("  Solutions", leftPadding, verticalCenter + lineHeight*3 - 15); // Adjusted spacing
    
    // Add fine print text at the bottom
    ctx.font = "italic 12px Inter"; // Small italicized font for fine print
    ctx.fillStyle = "#000000"; // Lighter color for fine print
    ctx.fillText("This app was 100% written by AI", leftPadding+75, PRINTER_BITMAP_HEIGHT - 8); // Position near bottom of canvas
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
});

// The QRCode library will be loaded via the script tag in the HTML
