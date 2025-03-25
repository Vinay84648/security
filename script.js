document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const resultText = document.getElementById('result-text');
    const flashButton = document.getElementById('flash-button');

    // Global variables
    let stream = null;
    let scanning = false;
    let flashOn = false;
    let currentTrack = null;
    const ctx = canvas.getContext('2d');

    // Start scanning automatically when page loads
    startScanner();

    // Flash button event listener
    flashButton.addEventListener('click', toggleFlash);

    // Function to toggle flash/torch
    function toggleFlash() {
        if (!currentTrack || flashButton.disabled) return;
        
        if (flashOn) {
            // Turn off flash
            currentTrack.applyConstraints({
                advanced: [{ torch: false }]
            }).then(() => {
                flashOn = false;
                flashButton.classList.remove('active');
            }).catch(err => {
                console.error('Flash control error:', err);
                resultText.textContent = 'Flash control not supported on this device';
                setTimeout(() => {
                    resultText.textContent = 'Point your camera at a QR code';
                }, 2000);
            });
        } else {
            // Turn on flash
            currentTrack.applyConstraints({
                advanced: [{ torch: true }]
            }).then(() => {
                flashOn = true;
                flashButton.classList.add('active');
            }).catch(err => {
                console.error('Flash control error:', err);
                resultText.textContent = 'Flash control not supported on this device';
                setTimeout(() => {
                    resultText.textContent = 'Point your camera at a QR code';
                }, 2000);
            });
        }
    }

    // Function to start the scanner
    async function startScanner() {
        try {
            resultText.textContent = 'Accessing camera...';
            
            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment', // Use back camera if available
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            // Set video source to camera stream
            video.srcObject = stream;
            video.setAttribute('playsinline', true); // Important for iOS
            
            // Get the video track for torch control
            currentTrack = stream.getVideoTracks()[0];
            
            // Check if torch is supported
            if (currentTrack.getCapabilities && currentTrack.getCapabilities().torch) {
                flashButton.disabled = false;
            } else {
                flashButton.disabled = true;
            }
            
            // Start video and scanning
            await video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            scanning = true;
            scanQRCode();
            
            resultText.textContent = 'Point your camera at a QR code';
        } catch (error) {
            console.error('Error accessing camera:', error);
            if (error.name === 'NotAllowedError') {
                resultText.textContent = 'Camera access denied. Please grant camera permissions.';
            } else {
                resultText.textContent = `Error: ${error.message}. Please refresh the page to try again.`;
            }
        }
    }

    // Function to stop the scanner
    function stopScanner() {
        if (stream) {
            // Stop all video tracks
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            currentTrack = null;
            
            // Reset flash state
            if (flashOn) {
                flashOn = false;
                flashButton.classList.remove('active');
            }
            flashButton.disabled = true;
            
            // Clear scanning state
            scanning = false;
            video.srcObject = null;
        }
    }

    // Function to scan for QR codes in video frame
    function scanQRCode() {
        if (!scanning) return;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            // Draw current video frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                // Get image data from canvas
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Process image data with jsQR library
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });
                
                // If QR code found
                if (code) {
                    // Check if the result is a URL
                    const url = code.data;
                    if (isValidURL(url)) {
                        // Stop scanning
                        scanning = false;
                        stopScanner();
                        
                        // Display the URL
                        resultText.textContent = `Found URL: ${url}\nRedirecting...`;
                        
                        // Navigate to the URL immediately
                        window.location.href = url;
                        
                        return;
                    }
                }
            } catch (error) {
                console.error('QR code scanning error:', error);
                // Continue scanning despite error
            }
        }
        
        // Continue scanning
        if (scanning) {
            requestAnimationFrame(scanQRCode);
        }
    }

    // Function to validate URLs
    function isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // Handle page visibility changes to stop scanner when page is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && stream) {
            stopScanner();
        } else if (!document.hidden && !stream) {
            startScanner();
        }
    });
}); 