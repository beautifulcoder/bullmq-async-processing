import { Queue } from "bullmq";
import { Worker, UnrecoverableError } from "bullmq";
import express from "express";

const ingredients = {
  "cheese": 10,
  "pepperoni": 5,
  "tomato": 10
};

let orders = [];

const ordersQueue = new Queue("orders");

const ordersWorker = new Worker(ordersQueue.name, async (job) => {
  const { orderId, menuItem } = job.data;

  job.updateProgress({
    message: `Processing order ${orderId} for ${menuItem}`
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  let ingredientsNeeded = {};

  switch (menuItem) {
    case "cheese":
      ingredientsNeeded = { cheese: 2, tomato: 1 };
      break;
    case "pepperoni":
      ingredientsNeeded = { cheese: 1, pepperoni: 1, tomato: 1 };
      break;
    default:
      throw new UnrecoverableError("Unknown menu item");
  }

  job.updateProgress({
    message: `Checking ingredients for order ${orderId} for ${menuItem}`
  });

  const canFulfillOrder = Object
    .entries(ingredientsNeeded)
    .every(([ingredient, amount]) => {
      return ingredients[ingredient] >= amount;
    });

  if (!canFulfillOrder) {
    throw new Error("Not enough ingredients to fulfill order");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  job.updateProgress({
    message: `Preparing order ${orderId} for ${menuItem}`
  });

  Object.entries(ingredientsNeeded).forEach(([ingredient, amount]) => {
    ingredients[ingredient] -= amount;
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
}, {
  connection: {
    host: "localhost",
    port: 6379
  }
});

ordersWorker.on("completed", (job) => {
  orders[job.data.orderId - 1].status = "completed";
  console.log(`Order ${job.data.orderId} completed successfully.`);
});

ordersWorker.on("failed", (job, err) => {
  orders[job.data.orderId - 1].status = "failed";
  console.error(`Order ${job.data.orderId} failed with error: ${err.message} Attempts: ${job.attemptsMade}`);
});

ordersWorker.on("progress", (job, progress) => {
  orders[job.data.orderId - 1].status = "processing";
  console.log(`Order ${job.data.orderId} progress: ${progress.message}`);
});

const inventoryQueue = new Queue("inventory");

const inventoryWorker = new Worker(inventoryQueue.name, async (job) => {
  const { ingredient, amount } = job.data;

  if (ingredients[ingredient] > 50) {
    job.updateProgress({
      message: `Already enough ${ingredient} in stock`
    });
    return;
  }

  job.updateProgress({
    message: `Restocking ${amount} of ${ingredient}`
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  ingredients[ingredient] += amount;

  job.updateProgress({
    message: `Restocked ${amount} of ${ingredient}`
  });
}, {
  connection: {
    host: "localhost",
    port: 6379
  }
});

inventoryWorker.on("completed", (job) => {
  console.log(`Restock of ${job.data.ingredient} completed successfully.`);
});

inventoryWorker.on("progress", (job, progress) => {
  console.log(`Restock of ${job.data.ingredient} progress: ${progress.message}`);
});

inventoryQueue.upsertJobScheduler(
  "restock-cheese-every-ten-seconds",
  { every: 10000 },
  {
    name: "restock-cheese",
    data: {
      ingredient: "cheese",
      amount: 10
    }
  });

inventoryQueue.upsertJobScheduler(
  "restock-pepperoni-every-twenty-seconds",
  { every: 20000 },
  {
    name: "restock-pepperoni",
    data: {
      ingredient: "pepperoni",
      amount: 5
    }
  });

inventoryQueue.upsertJobScheduler(
  "restock-tomato-every-ten-seconds",
  { every: 10000 },
  {
    name: "restock-tomato",
    data: {
      ingredient: "tomato",
      amount: 10
    }
  });

const app = express();
app.use(express.json());

// curl -i -s -X POST -H "Content-Type:application/json" -d "{\"count\":300,\"cheesy\":0.4}" http://localhost:3000/orders
app.post("/orders", async (req, res) => {
  const { count, cheesy } = req.body;

  orders = Array.from({ length: count }, (_, i) => {
    return {
      orderId: i + 1,
      menuItem: Math.random() < cheesy ? "cheese" : "pepperoni",
      status: "pending"
    };
  });

  const jobs = orders.map((order) => {
    return {
      name: "order",
      data: order,
      opts: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000
        }
      }
    };
  });

  await ordersQueue.addBulk(jobs);

  res.status(204).send();
});

// curl -i -s -X GET -H "Accept:application/json" http://localhost:3000/orders
app.get("/orders", async (_, res) => {
  res.json({
    orders: orders.filter(
      order => order.status === "processing"),
    failedCount: orders.filter(
      order => order.status === "failed").length,
    completedCount: orders.filter(
      order => order.status === "completed").length,
    cheeseCount: orders.filter(
      order => order.menuItem === "cheese" &&
        order.status === "completed").length,
    pepperoniCount: orders.filter(
      order => order.menuItem === "pepperoni" &&
        order.status === "completed").length
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
