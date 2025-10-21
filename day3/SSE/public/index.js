
const baseUrl = "http://localhost:3000";

const longRunningRegular = document.querySelector("#long-running-regular");
const longRunningRegularSpinner = document.querySelector("#long-running-regular-spinner");
const longRunningRegularOutput = document.querySelector("#long-running-regular-output");

const longRunningStreaming = document.querySelector("#long-running-streaming");
const longRunningStreamingSpinner = document.querySelector("#long-running-streaming-spinner");
const longRunningStreamingOutput = document.querySelector("#long-running-streaming-output");

const sseDataOnly = document.querySelector("#sse-data-only");
const sseDataOnlySpinner = document.querySelector("#sse-data-only-spinner");
const sseDataOnlyOutput = document.querySelector("#sse-data-only-output");

const sseCustomEvents = document.querySelector("#sse-custom-events");
const sseCustomEventsSpinner = document.querySelector("#sse-custom-events-spinner");
const sseCustomEventsOutput = document.querySelector("#sse-custom-events-output");

const sseCustomEventsId = document.querySelector("#sse-custom-events-id");
const sseCustomEventsIdSpinner = document.querySelector("#sse-custom-events-id-spinner");
const sseCustomEventsIdOutput = document.querySelector("#sse-custom-events-id-output");

longRunningRegular.addEventListener("click", async () => {
  longRunningRegularSpinner.hidden = false;
  longRunningRegularOutput.innerHTML = "";

  try {
    const startTime = performance.now();
    const response = await fetch(`${baseUrl}/long-running/regular`, { method: "POST", });
    const endTime = performance.now();

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    longRunningRegularOutput.innerHTML = `${data}\n(Duration: ${endTime - startTime}ms)`;
  } catch (error) {
    longRunningRegularOutput.innerHTML = `Error: ${error.message}`;
  } finally {
    longRunningRegularSpinner.hidden = true;
  }
});

longRunningStreaming.addEventListener("click", async () => {
  longRunningStreamingSpinner.hidden = false;
  longRunningStreamingOutput.innerHTML = "";

  try {
    const startTime = performance.now();
    const response = await fetch(`${baseUrl}/long-running/streaming`, { method: "POST", });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const endTime = performance.now();
    longRunningStreamingOutput.innerHTML = `(Duration: ${endTime - startTime}ms)\n`;

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      longRunningStreamingOutput.innerHTML += new TextDecoder().decode(value);
    }
  } catch (error) {
    longRunningStreamingOutput.innerHTML += `\nError: ${error.message}`;
  } finally {
    longRunningStreamingSpinner.hidden = true;
  }
});

sseDataOnly.addEventListener("click", async () => {
  sseDataOnlySpinner.hidden = false;
  sseDataOnlyOutput.innerHTML = "";

  const eventSource = new EventSource(`${baseUrl}/sse/data-only`);
  eventSource.onmessage = (event) => {
    // Close the connection when the server sends and empty message
    if (!event.data) {
      eventSource.close();
      sseDataOnlySpinner.hidden = true;
    }

    sseDataOnlyOutput.innerHTML += `${event.data}\n`;
  };
  eventSource.onerror = (error) => { 
    sseDataOnlyOutput.innerHTML += `Error in SSE: ${error.type || 'Connection failed'}\n`;
    eventSource.close();
    sseDataOnlySpinner.hidden = true;
  };
  eventSource.onopen = () => { sseDataOnlyOutput.innerHTML += `SSE connection opened\n`; }
});

sseCustomEvents.addEventListener("click", async () => {
  sseCustomEventsSpinner.hidden = false;
  sseCustomEventsOutput.innerHTML = "";

  const eventSource = new EventSource(`${baseUrl}/sse/custom-events`);

  // Note that we are using the addEventListener method here instead of onmessage.
  // With this, we can add custom event listeners for different event types.
  eventSource.addEventListener("even", (event) => {
    try {
      sseCustomEventsOutput.innerHTML += `EVEN: ${JSON.parse(event.data).value}\n`;
    } catch (error) {
      sseCustomEventsOutput.innerHTML += `Error parsing event data: ${error.message}\n`;
    }
  });
  eventSource.addEventListener("odd", (event) => {
    try {
      sseCustomEventsOutput.innerHTML += `ODD: ${JSON.parse(event.data).value}\n`;
    } catch (error) {
      sseCustomEventsOutput.innerHTML += `Error parsing event data: ${error.message}\n`;
    }
  });
  eventSource.addEventListener("eom", () => {
    eventSource.close();
    sseCustomEventsSpinner.hidden = true;
  });
  eventSource.onerror = (error) => {
    sseCustomEventsOutput.innerHTML += `Error in SSE: ${error.type || 'Connection failed'}\n`;
    eventSource.close();
    sseCustomEventsSpinner.hidden = true;
  };
});

sseCustomEventsId.addEventListener("click", async () => {
  sseCustomEventsIdSpinner.style.display = "block";
  sseCustomEventsIdOutput.innerHTML = "";

  const eventSource = new EventSource(`${baseUrl}/sse/custom-events-with-id`);

  eventSource.addEventListener("even", (event) => {
    sseCustomEventsIdOutput.innerHTML += `EVEN: ${JSON.parse(event.data).value}\n`;
  });
  eventSource.addEventListener("odd", (event) => {
    sseCustomEventsIdOutput.innerHTML += `ODD: ${JSON.parse(event.data).value}\n`;
  });
  eventSource.addEventListener("eom", () => {
    eventSource.close();
    sseCustomEventsIdSpinner.style.display = "";
  });
});