const captureInput = document.querySelector("#captureInput");
const phonePreview = document.querySelector("#phonePreview");
const sendCaptureButton = document.querySelector("#sendCaptureButton");
const phoneStatus = document.querySelector("#phoneStatus");

const phoneState = {
  dataUrl: "",
  file: null
};

function setStatus(message, tone = "neutral") {
  phoneStatus.textContent = message;
  phoneStatus.dataset.tone = tone;
}

function readSelectedFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Choose an image from the camera or photo library.", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus("That image is too large. Try a smaller photo.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    phoneState.dataUrl = String(reader.result || "");
    phoneState.file = file;
    phonePreview.innerHTML = `<img src="${phoneState.dataUrl}" alt="Selected camera capture">`;
    sendCaptureButton.disabled = false;
    setStatus("Photo ready to send.", "ready");
  };
  reader.onerror = () => {
    setStatus("Could not read that photo.", "error");
  };
  reader.readAsDataURL(file);
}

async function sendCapture() {
  if (!phoneState.dataUrl || !phoneState.file) return;
  sendCaptureButton.disabled = true;
  setStatus("Sending to portal...", "neutral");

  try {
    const response = await fetch("api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: phoneState.dataUrl,
        name: phoneState.file.name || "phone-capture.jpg",
        size: phoneState.file.size
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Upload failed.");
    }

    setStatus("Sent. Check the computer portal.", "success");
  } catch (error) {
    sendCaptureButton.disabled = false;
    setStatus(error.message || "Could not send the photo.", "error");
  }
}

captureInput.addEventListener("change", () => {
  readSelectedFile(captureInput.files?.[0]);
});

sendCaptureButton.addEventListener("click", sendCapture);
