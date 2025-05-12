document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const loadingScreen = document.getElementById("loading-screen")
  const registrationForm = document.getElementById("registration-form")
  const successScreen = document.getElementById("success-screen")
  const redirectScreen = document.getElementById("redirect-screen")
  const errorScreen = document.getElementById("error-screen")
  const errorMessage = document.getElementById("error-message")
  const retryButton = document.getElementById("retry-button")
  const attendeeForm = document.getElementById("attendee-form")
  const codeInput = document.getElementById("code-input")

  // Local storage keys for testing
  const REGISTERED_CODES_KEY = "qr_registered_codes"
  
  // Get the code from URL query parameters
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get("code")

  // If no code is provided, show error
  if (!code) {
    showError("No registration code provided. Please scan a valid QR code.")
    return
  }

  // Set the code in the hidden input
  codeInput.value = code

  // Check if the code is already registered
  checkRegistrationStatus(code)

  // Form submission
  attendeeForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    const formData = new FormData(attendeeForm)
    const formDataObj = Object.fromEntries(formData.entries())

    try {
      // Show loading state
      registrationForm.classList.add("hidden")
      loadingScreen.classList.remove("hidden")

      // Simulate API call for testing
      const mockResponse = await simulateRegisterAPI(formDataObj)

      // Show success screen
      loadingScreen.classList.add("hidden")
      successScreen.classList.remove("hidden")

      // If there's a finalUrl, redirect after a delay
      if (mockResponse.finalUrl) {
        setTimeout(() => {
          window.location.href = mockResponse.finalUrl
        }, 3000)
      }
    } catch (error) {
      console.error("Registration error:", error)
      showError("Failed to register: " + error.message)
    }
  })

  // Retry button
  retryButton.addEventListener("click", () => {
    errorScreen.classList.add("hidden")
    registrationForm.classList.remove("hidden")
  })

  // Simulate registration API call for testing
  function simulateRegisterAPI(formData) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Get existing registered codes from localStorage
        const registeredCodes = JSON.parse(localStorage.getItem(REGISTERED_CODES_KEY) || "{}")
        
        // Register this code
        registeredCodes[formData.code] = {
          registered: true,
          finalUrl: formData.profileUrl,
          name: formData.name
        }
        
        // Save to localStorage
        localStorage.setItem(REGISTERED_CODES_KEY, JSON.stringify(registeredCodes))
        
        resolve({
          status: "success",
          finalUrl: formData.profileUrl
        })
      }, 1000) // Simulate network delay
    })
  }

  // Check if the code is already registered
  async function checkRegistrationStatus(code) {
    try {
      // For testing, use localStorage instead of API
      const registrationResult = await simulateCheckRegistrationAPI(code)

      // Hide loading screen
      loadingScreen.classList.add("hidden")

      // If already registered and has finalUrl, redirect
      if (registrationResult.registered && registrationResult.finalUrl) {
        redirectScreen.classList.remove("hidden")
        setTimeout(() => {
          window.location.href = registrationResult.finalUrl
        }, 2000)
      } else if (registrationResult.registered) {
        // If registered but no finalUrl, show success
        successScreen.classList.remove("hidden")
      } else {
        // Not registered, show form
        registrationForm.classList.remove("hidden")
      }
    } catch (error) {
      console.error("Error checking registration status:", error)
      showError("Failed to check registration status: " + error.message)
    }
  }

  // Simulate check registration API call for testing
  function simulateCheckRegistrationAPI(code) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Get registered codes from localStorage
        const registeredCodes = JSON.parse(localStorage.getItem(REGISTERED_CODES_KEY) || "{}")
        
        if (registeredCodes[code]) {
          resolve({
            registered: true,
            finalUrl: registeredCodes[code].finalUrl
          })
        } else {
          resolve({
            registered: false
          })
        }
      }, 1000) // Simulate network delay
    })
  }

  // Show error screen with message
  function showError(message) {
    loadingScreen.classList.add("hidden")
    registrationForm.classList.add("hidden")
    successScreen.classList.add("hidden")
    redirectScreen.classList.add("hidden")

    errorMessage.textContent = message
    errorScreen.classList.remove("hidden")
  }
})
