import express from 'express';
import cors from 'cors';
import { mcpMethodNotAllowedHandler, mcpPostHandler } from './mcp-express-handlers.js';

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: '*',
    // Note: In CORS, “exposed headers” are the HTTP response headers that the browser 
    // is allowed to make visible to JavaScript code running in the web page.
    exposedHeaders: ['Mcp-Session-Id'],
  })
);

// Health check endpoint
app.get('/ping', (req, res) => res.send(JSON.stringify({ message: 'pong' })));

app.post('/mcp', mcpPostHandler);
app.get('/mcp', mcpMethodNotAllowedHandler);
app.delete('/mcp', mcpMethodNotAllowedHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, error => {
  if (error) {
    console.error(`Error starting server: ${error}`);
    process.exit(1);
  }
  
  console.log(`Server is running on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit();
});
