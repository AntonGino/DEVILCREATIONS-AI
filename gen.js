document.addEventListener('DOMContentLoaded', async function () {
    const generateButton = document.querySelector('.btn');
    const inputArea = document.querySelector('.input-area textarea');
    const outputArea = document.querySelector('.output-area');
    const cookieConsentPopup = document.getElementById('cookie-consent-popup');
    const acceptCookiesButton = document.querySelector('.acceptButton');
    const declineCookiesButton = document.querySelector('.declineButton');
    const redirectToPopupButton = document.getElementById('redirect-to-popup');
    const cookieErrorMessage = document.querySelector('.cookie-error-message');
    const consent = Cookies.get('cookieConsent');

    // -----------------------------------------------------------------------
    // Backend URL — localhost in dev, Render backend in production
    // -----------------------------------------------------------------------
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const BACKEND_URL = isLocalhost
        ? 'http://127.0.0.1:8000'
        : 'https://devilcreations-ai.onrender.com';

    // Ensure all elements exist
    if (!generateButton || !inputArea || !outputArea || !cookieConsentPopup || !acceptCookiesButton || !declineCookiesButton || !cookieErrorMessage) {
        console.error('One or more elements are missing in the DOM.');
        return;
    }

    // Check cookie consent status
    const checkCookieConsent = () => {
        const consent = Cookies.get('cookieConsent');
        if (consent === 'accepted') {
            cookieConsentPopup.style.display = 'none';
            document.body.classList.remove('no-scroll');
            cookieErrorMessage.style.display = 'none';
        } else if (consent === 'declined') {
            cookieConsentPopup.style.display = 'none';
            document.body.classList.remove('no-scroll');
            cookieErrorMessage.style.display = 'block';
            localStorage.removeItem('history');
        } else {
            cookieConsentPopup.style.display = 'flex';
            document.body.classList.add('no-scroll');
            cookieErrorMessage.style.display = 'none';
        }
    };

    // Handle accept cookies
    acceptCookiesButton.addEventListener('click', () => {
        Cookies.set('cookieConsent', 'accepted', { expires: 30 });
        cookieConsentPopup.style.display = 'none';
        document.body.classList.remove('no-scroll');
        cookieErrorMessage.style.display = 'none';
        displayHistory();
        console.log('Cookies accepted');
    });

    // Handle decline cookies
    declineCookiesButton.addEventListener('click', () => {
        Cookies.set('cookieConsent', 'declined', { expires: 30 });
        cookieConsentPopup.style.display = 'none';
        document.body.classList.remove('no-scroll');
        cookieErrorMessage.style.display = 'block';
        showPopup('History disabled. Please accept cookies to enable history.', true);
        displayHistory();
        console.log('Cookies declined');
    });

    // Redirect to cookie consent popup
    if (redirectToPopupButton) {
        redirectToPopupButton.addEventListener('click', () => {
            cookieErrorMessage.style.display = 'none';
            cookieConsentPopup.style.display = 'flex';
            deleteUploadButton.style.display = 'none';
            document.body.classList.add('no-scroll');
        });
    }

    const model1Checkbox = document.getElementById('model1');
    const model2Checkbox = document.getElementById('model2');

    // Ensure only one checkbox is selected at a time
    model1Checkbox.addEventListener('change', () => {
        if (model1Checkbox.checked) {
            model2Checkbox.checked = false;
        }
    });

    model2Checkbox.addEventListener('change', () => {
        if (model2Checkbox.checked) {
            model1Checkbox.checked = false;
        }
    });

    // Close the menu when a checkbox is checked or unchecked
    model1Checkbox.addEventListener('change', () => {
        document.getElementById('models-menu').classList.remove('open');
        document.getElementById('models-menu-button').classList.remove('active');
    });

    model2Checkbox.addEventListener('change', () => {
        document.getElementById('models-menu').classList.remove('open');
        document.getElementById('models-menu-button').classList.remove('active');
    });

    // -----------------------------------------------------------------------
    // Image generation — calls the FastAPI backend instead of direct API
    // -----------------------------------------------------------------------
    const queryImage = async (prompt) => {
        try {
            // Determine which model to use
            let modelId;
            if (model2Checkbox.checked) {
                modelId = 'flux-2-max';
            } else {
                // Default to flux-1-dev (model1)
                if (!model1Checkbox.checked) {
                    model1Checkbox.checked = true;
                }
                modelId = 'flux-1-dev';
            }

            const response = await fetch(`${BACKEND_URL}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    model: modelId,
                    width: 1024,
                    height: 1024,
                    steps: 50,
                    cfg_scale: 3.5,
                    seed: 0,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.detail || `Server error (${response.status})`;
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // Convert base64 to blob
            const byteChars = atob(data.image_base64);
            const byteNumbers = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
                byteNumbers[i] = byteChars.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: data.content_type });

            return blob;
        } catch (error) {
            console.error('Error generating image:', error);
            throw error; // Re-throw so the caller can show proper error
        }
    };

    // Function to convert blob to data URL
    const blobToDataURL = (blob, callback) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            callback(e.target.result);
        };
        reader.readAsDataURL(blob);
    };

    // Function to save history to local storage
    const saveToHistory = async (prompt, imageBlob) => {
        return new Promise((resolve) => {
            const consent = Cookies.get('cookieConsent');
            if (consent === 'accepted') {
                blobToDataURL(imageBlob, (dataUrl) => {
                    const history = getHistory();
                    const modelUsed = model2Checkbox.checked
                        ? 'Flux.2-max'
                        : 'Flux.1-dev';
                    history.push({ prompt, imageUrl: dataUrl, modelUsed });
                    localStorage.setItem('history', JSON.stringify(history));
                    console.log('History saved successfully');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    };

    // Function to retrieve history from local storage
    const getHistory = () => {
        const historyValue = localStorage.getItem('history');
        if (historyValue) {
            try {
                return JSON.parse(historyValue);
            } catch (error) {
                console.error('Error parsing history from local storage:', error);
            }
        }
        return [];
    };

    // Function to display history in the history viewer
    const displayHistory = () => {
        const historyContainer = document.querySelector('.history-container');
        const deleteButton = document.querySelector('.delete-history-btn');
        const noHistoryMessage = document.querySelector('.no-history-message');
        const history = getHistory();
        const consent = Cookies.get('cookieConsent');

        if (consent === 'declined') {
            historyContainer.style.display = 'none';
            deleteButton.style.display = 'none';
            noHistoryMessage.style.display = 'none';
            return;
        }

        if (history.length === 0) {
            noHistoryMessage.style.display = 'block';
            historyContainer.innerHTML = '';
            deleteButton.style.display = 'none';
            return;
        }

        noHistoryMessage.style.display = 'none';
        historyContainer.innerHTML = history
            .map(
                (item, index) => `
                <div class="history-item">
                    <p><strong>Prompt ${index + 1}:</strong> ${item.prompt}</p>
                    <p><strong>Model Used:</strong> ${item.modelUsed}</p>
                    <img src="${item.imageUrl}" alt="Generated Image ${index + 1}" class="history-image">
                    <div class="button-group">
                        <a href="${item.imageUrl}" download="hist-download-${index + 1}.png" class="download-button">
                            <i class="fas fa-download"></i> Download
                        </a>
                        <button class="share-h" data-url="${item.imageUrl}">
                            <span data-text-end="Shared!" data-text-initial="Share" class="tooltip"></span>
                            <span class="material-icons">
                                share
                            </span>
                        </button>
                    </div>
                </div>
            `
            )
            .join('');

        deleteButton.style.display = 'block';

        // Add event listeners for share buttons
        document.querySelectorAll('.share-h').forEach((button) => {
            button.addEventListener('click', () => {
                const imageUrl = button.getAttribute('data-url');
                shareImage(imageUrl);
            });
        });
    };

    // Function to clear history
    const clearHistory = () => {
        localStorage.removeItem('history');
        displayHistory();
    };

    // Add event listener for the delete history button
    document.querySelector('.delete-history-btn').addEventListener('click', clearHistory);

    // Call displayHistory on page load
    displayHistory();

    // Call checkCookieConsent on page load
    checkCookieConsent();

    // Function to show loading animation
    const showLoadingAnimation = () => {
        outputArea.innerHTML = `
            <div class="ui-abstergo">
                <div class="abstergo-loader">
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <div class="ui-text">
                    Generating
                    <div class="ui-dot"></div>
                    <div class="ui-dot"></div>
                    <div class="ui-dot"></div>
                </div>
            </div>
        `;
        generateButton.innerHTML = `<span class="spinner"></span> Generating...`;
        generateButton.disabled = true;
    };

    // Function to hide loading animation
    const hideLoadingAnimation = () => {
        generateButton.innerHTML = `
            <svg height="24" width="24" fill="#FFFFFF" viewBox="0 0 24 24" data-name="Layer 1" id="Layer_1" class="sparkle">
                <path d="M10,21.236,6.755,14.745.264,11.5,6.755,8.255,10,1.764l3.245,6.491L19.736,11.5l-6.491,3.245ZM18,21l1.5,3L21,21l3-1.5L21,18l-1.5-3L18,18l-3,1.5ZM19.333,4.667,20.5,7l1.167-2.333L24,3.5,21.667,2.333,20.5,0,19.333,2.333,17,3.5z"></path>
            </svg>
            <span class="text">Generate</span>
        `;
        generateButton.disabled = false;
    };

    // Function to show error message
    const showError = (message) => {
        outputArea.innerHTML = `
            <div class="error-message">
                <span class="material-icons" style="font-size: 48px; color: #d65563;">error</span>
                <p>${message}</p>
            </div>
        `;
    };

    // Function to share image
    const shareImage = (imageUrl) => {
        if (navigator.share) {
            fetch(imageUrl)
                .then((response) => response.blob())
                .then((blob) => {
                    const file = new File([blob], 'shared-image.png', { type: blob.type });
                    navigator
                        .share({
                            title: 'Check out this image from Devil Creations!',
                            files: [file],
                        })
                        .then(() => {
                            console.log('Shared successfully!');
                        })
                        .catch((error) => {
                            console.error('Error sharing:', error);
                        });
                })
                .catch((error) => {
                    console.error('Error fetching blob:', error);
                });
        } else {
            alert('Sharing is not supported on this browser.');
        }
    };

    // -----------------------------------------------------------------------
    // Fetch sensitive words from the backend (no more config.json exposure)
    // -----------------------------------------------------------------------
    let cachedSensitiveWords = null;

    const fetchSensitiveWords = async () => {
        if (cachedSensitiveWords) return cachedSensitiveWords;
        try {
            const response = await fetch(`${BACKEND_URL}/api/sensitive-words`);
            const data = await response.json();
            cachedSensitiveWords = data.words || [];
            return cachedSensitiveWords;
        } catch (error) {
            console.error('Error fetching sensitive words from backend:', error);
            return [];
        }
    };

    // Check if prompt contains sensitive words
    const containsSensitiveWords = (prompt, sensitiveWords) => {
        const promptWords = prompt.toLowerCase().split(/\s+/);
        return sensitiveWords.some((word) => promptWords.includes(word.toLowerCase()));
    };

    // Handle image generation
    const generateImage = async (prompt) => {
        showLoadingAnimation();

        try {
            const sensitiveWords = await fetchSensitiveWords();
            if (containsSensitiveWords(prompt, sensitiveWords)) {
                showError('SENSITIVE WORDS NOT ALLOWED! Please try again with a different prompt.');
                return;
            }

            // Ensure a model is selected
            if (!model1Checkbox.checked && !model2Checkbox.checked) {
                model1Checkbox.checked = true;
            }

            const imageBlob = await queryImage(prompt);
            const imageUrl = URL.createObjectURL(imageBlob);
            outputArea.innerHTML = `
                <img src="${imageUrl}" alt="Generated Image" class="generated-image">
                <div class="button-group">
                    <a href="${imageUrl}" download="generated-image.png" class="dbutton">
                        <div class="points_wrapper">
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                            <i class="point"></i>
                        </div>
                        <span class="inner">
                            <i class="fas fa-download"></i>
                            Download Image
                        </span>
                    </a>
                    <button class="sbutton" data-url="${imageUrl}">
                        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" class="sicon">
                            <path d="M307 34.8c-11.5 5.1-19 16.6-19 29.2v64H176C78.8 128 0 206.8 0 304C0 417.3 81.5 467.9 100.2 478.1c2.5 1.4 5.3 1.9 8.1 1.9c10.9 0 19.7-8.9 19.7-19.7c0-7.5-4.3-14.4-9.8-19.5C108.8 431.9 96 414.4 96 384c0-53 43-96 96-96h96v64c0 12.6 7.4 24.1 19 29.2s25 3 34.4-5.4l160-144c6.7-6.1 10.6-14.7 10.6-23.8s-3.8-17.7-10.6-23.8l-160-144c-9.4-8.5-22.9-10.6-34.4-5.4z"></path>
                        </svg>
                        Share
                    </button>
                </div>
            `;

            // Save to history and refresh display
            await saveToHistory(prompt, imageBlob);
            displayHistory();

            // Add event listener for the share button
            document.querySelector('.sbutton').addEventListener('click', () => {
                shareImage(imageUrl);
            });
        } catch (error) {
            console.error('Error generating image:', error);
            showError(error.message || 'Image generation failed. Please try again.');
        } finally {
            hideLoadingAnimation();
        }
    };

    // Add event listener to the generate button
    generateButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const prompt = inputArea.value.trim();
        if (prompt) {
            const sensitiveWords = await fetchSensitiveWords();
            if (containsSensitiveWords(prompt, sensitiveWords)) {
                showError('SENSITIVE WORDS NOT ALLOWED');
            } else {
                generateImage(prompt);
            }
        } else {
            showError('Please enter a prompt to generate an image!');
        }
    });

    // Add event listener for the generate history button
    document.querySelector('.generate-history-btn').addEventListener('click', (event) => {
        event.preventDefault();
        const targetSection = document.getElementById('generate');
        const headerOffset = 60;
        const elementPosition = targetSection.offsetTop;
        const offsetPosition = elementPosition - headerOffset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth',
        });
    });

    emailjs.init('3Wmah-KXDugujWGcq');

    const fileInput = document.getElementById('report-files');
    const fileUploadArea = document.getElementById('file-upload-area');
    const deleteUploadButton = document.getElementById('delete-upload');
    const fileUploadLabel = document.querySelector('.file-upload-label');

    // Handle file selection
    fileInput.addEventListener('change', handleFileSelect);

    // Handle drag over event
    fileUploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        fileUploadArea.classList.add('drag-over');
    });

    // Handle drag leave event
    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('drag-over');
    });

    // Handle drop event
    fileUploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        fileUploadArea.classList.remove('drag-over');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect({ target: { files } });
        }
    });

    function handleFileSelect(event) {
        const file = event.target.files[0];

        if (!file.type.startsWith('image/')) {
            showPopup('Only images are allowed! Please upload an image.', true);
            fileInput.value = '';
            deleteUploadButton.style.display = 'none';
            fileInput.disabled = false;
            fileUploadLabel.classList.remove('disabled');
            fileUploadLabel.textContent = 'Attach Files (optional)';
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showPopup('Image is too large! Please upload a smaller image.', true);
            fileInput.value = '';
            deleteUploadButton.style.display = 'none';
            fileInput.disabled = false;
            fileUploadLabel.classList.remove('disabled');
            fileUploadLabel.textContent = 'Attach Files (optional)';
            return;
        }

        deleteUploadButton.style.display = 'inline-block';
        fileInput.disabled = true;
        fileUploadLabel.classList.add('disabled');
        fileUploadLabel.textContent = 'File Uploaded';
    }

    // Handle the delete upload button
    deleteUploadButton.addEventListener('click', function () {
        fileInput.value = '';
        this.style.display = 'none';
        fileInput.disabled = false;
        fileUploadLabel.classList.remove('disabled');
        fileUploadLabel.textContent = 'Attach Files (optional)';
    });

    // Handle form submission to send report email
    document.getElementById('report-form').addEventListener('submit', async function (event) {
        event.preventDefault();

        const details = document.getElementById('report-details').value;
        const file = fileInput.files[0];

        try {
            let response;
            if (file) {
                const reader = new FileReader();
                const base64Image = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });

                response = await emailjs.send('service_v1t7jls', 'template_2ut47fb', {
                    from_name: 'User(Devil Creations)',
                    message: details,
                    to_email: 'antonginoja200@gmail.com',
                    image: base64Image,
                });
            } else {
                response = await emailjs.send('service_v1t7jls', 'template_2ut47fb', {
                    from_name: 'User(Devil Creations)',
                    message: details,
                    to_email: 'antonginoja200@gmail.com',
                });
            }

            if (response.status === 200) {
                showPopup('Report submitted successfully!', false);
                this.reset();
                fileInput.value = '';
                deleteUploadButton.style.display = 'none';
                fileInput.disabled = false;
                fileUploadLabel.classList.remove('disabled');
                fileUploadLabel.textContent = 'Attach Files (optional)';
            }
        } catch (error) {
            console.error('Error submitting report:', error);
            showPopup('Failed to submit report. Please try again.', true);
        }
    });

    // Function to show success/error popup
    function showPopup(message, isError) {
        const popup = document.getElementById('popup');
        popup.textContent = message;
        popup.className = isError ? 'popup error visible' : 'popup visible';
        popup.style.left = '50%';
        popup.style.marginTop = '20px';

        setTimeout(() => {
            popup.classList.remove('visible');
            popup.style.left = '-300px';
        }, 5000);
    }

    const modelsMenuButton = document.getElementById('models-menu-button');
    const modelsMenu = document.getElementById('models-menu');

    modelsMenuButton.addEventListener('click', () => {
        modelsMenuButton.classList.toggle('active');
        if (modelsMenu.classList.contains('open')) {
            modelsMenu.classList.remove('open');
        } else {
            modelsMenu.classList.add('open');
        }
    });
});
