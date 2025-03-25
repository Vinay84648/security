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

    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        resultText.textContent = 'Your browser does not support camera access. Please use Chrome, Firefox or Safari.';
        return; // Exit early if not supported
    }

    // Start scanning automatically when page loads
    setTimeout(() => {
        startScanner();
    }, 500); // Small delay to ensure DOM is ready

    // Flash button event listener
    flashButton.addEventListener('click', toggleFlash);

    // Function to toggle flash/torch
    function toggleFlash() {
        if (!currentTrack || flashButton.disabled) return;
        
        try {
            // Check if torch is actually supported
            const capabilities = currentTrack.getCapabilities ? currentTrack.getCapabilities() : {};
            if (!capabilities || !capabilities.torch) {
                flashButton.disabled = true;
                resultText.textContent = 'Flash not available on this device';
                setTimeout(() => {
                    resultText.textContent = 'Point your camera at a QR code';
                }, 2000);
                return;
            }
            
            if (flashOn) {
                // Turn off flash
                currentTrack.applyConstraints({
                    advanced: [{ torch: false }]
                })
                .then(() => {
                    flashOn = false;
                    flashButton.classList.remove('active');
                })
                .catch(err => {
                    console.error('Flash control error:', err);
                    flashButton.disabled = true;
                });
            } else {
                // Turn on flash
                currentTrack.applyConstraints({
                    advanced: [{ torch: true }]
                })
                .then(() => {
                    flashOn = true;
                    flashButton.classList.add('active');
                })
                .catch(err => {
                    console.error('Flash control error:', err);
                    flashButton.disabled = true;
                    resultText.textContent = 'Flash control not available';
                    setTimeout(() => {
                        resultText.textContent = 'Point your camera at a QR code';
                    }, 2000);
                });
            }
        } catch (error) {
            console.error('Flash toggle error:', error);
            flashButton.disabled = true;
        }
    }

    // Function to start the scanner with multiple fallback options
    async function startScanner() {
        try {
            resultText.textContent = 'Accessing camera...';
            
            // Try multiple approaches for camera access
            try {
                // First attempt: environment facing camera (back camera)
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { exact: 'environment' } }
                });
            } catch (err1) {
                console.log('Exact environment camera failed, trying without exact constraint');
                
                try {
                    // Second attempt: prefer environment camera but don't require it
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'environment' }
                    });
                } catch (err2) {
                    console.log('Environment camera failed, trying any camera');
                    
                    try {
                        // Third attempt: any camera
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: true
                        });
                    } catch (err3) {
                        console.error('All camera access attempts failed');
                        throw new Error('Unable to access any camera');
                    }
                }
            }
            
            console.log('Camera access successful');
            
            // Set video source to camera stream
            video.srcObject = stream;
            video.setAttribute('playsinline', true); // Important for iOS
            video.setAttribute('autoplay', true);
            
            // Get the video track for torch control
            currentTrack = stream.getVideoTracks()[0];
            console.log('Video track obtained:', currentTrack.label);
            
            // Safely check if torch is supported
            try {
                const capabilities = currentTrack.getCapabilities ? currentTrack.getCapabilities() : {};
                flashButton.disabled = !(capabilities && capabilities.torch);
                console.log('Torch capability:', capabilities && capabilities.torch ? 'Available' : 'Not available');
            } catch (e) {
                console.error('Error checking torch capability:', e);
                flashButton.disabled = true;
            }
            
            // Start video and wait for it to be ready
            try {
                await video.play();
                console.log('Video playback started');
            } catch (playError) {
                console.error('Error playing video:', playError);
                resultText.textContent = 'Error starting video. Please refresh and try again.';
                return;
            }
            
            // Set up canvas for QR scanning
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('Canvas size set:', canvas.width, 'x', canvas.height);
            
            // Start scanning
            scanning = true;
            scanQRCode();
            
            resultText.textContent = 'Point your camera at a QR code';
        } catch (error) {
            console.error('Camera access error:', error);
            if (error.name === 'NotAllowedError') {
                resultText.textContent = 'Camera access denied. Please grant camera permissions and refresh.';
            } else if (error.name === 'NotFoundError') {
                resultText.textContent = 'No camera found on this device.';
            } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
                resultText.textContent = 'Camera is already in use or not readable.';
            } else if (error.name === 'OverconstrainedError') {
                resultText.textContent = 'Camera constraints cannot be satisfied. Please use a different browser.';
            } else {
                resultText.textContent = 'Camera error: ' + (error.message || 'Unknown error');
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

    // Function to briefly pause scanning (for showing warnings)
    function pauseScanning(duration = 3000) {
        scanning = false;
        
        // Resume scanning after duration
        setTimeout(() => {
            if (stream) {
                scanning = true;
                scanQRCode();
                resultText.textContent = 'Point your camera at a QR code';
            }
        }, duration);
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
                    const content = code.data;
                    console.log('QR code detected:', content);
                    
                    // Check if the result is a URL
                    if (isValidURL(content)) {
                        // Stop scanning
                        scanning = false;
                        stopScanner();
                        
                        // Display the URL
                        resultText.textContent = `Found URL: ${content}\nRedirecting...`;
                        
                        // Navigate to the URL immediately
                        window.location.href = content;
                        
                        return;
                    } else {
                        // Not a URL - show warning
                        resultText.textContent = 'UNAUTHORIZED REQUEST: QR code does not contain a valid URL';
                        resultText.classList.add('warning');
                        
                        // Pause scanning briefly to show the warning
                        pauseScanning(3000);
                        
                        // Reset text color and remove warning class after warning
                        setTimeout(() => {
                            resultText.style.color = '#fff';
                            resultText.classList.remove('warning');
                        }, 3000);
                        
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
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
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
