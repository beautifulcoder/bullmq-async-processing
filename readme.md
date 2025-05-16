# BullMQ Asynchronous Processing

To run the BullMQ asynchronous processing example, follow these steps:

1. **Install Dependencies**: Make sure you have Node.js and npm installed. Then, install the required packages by running:
   ```bash
   npm install
   ```
2. **Start Redis**: Ensure that you have a Redis server running. You can start it using Docker:
   ```bash
docker run -d -p 6379:6379 redis
   ```
3. **Run the Worker**: Start the worker process that will handle the jobs:
   ```bash
    node index.js
    ```
4. **Call the API**: Use a tool like Postman or curl to send a POST request to the API endpoint:
   ```bash
   curl -i -s -X POST -H "Content-Type:application/json" -d "{\"count\":300,\"cheesy\":0.4}" http://localhost:3000/orders
   ```

5. **Check the Orders**: After sending the request, you can call the `/orders` endpoint to see the processed orders:
   ```bash
   curl -i -s -X GET -H "Accept:application/json" http://localhost:3000/orders
   ```
