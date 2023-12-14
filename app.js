const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const axios = require("axios");
const cors = require("cors");
let db = null;
const app = express();
app.use(cors());

const dbPath = path.join(__dirname, "database.db");
const port = process.env.PORT || 5004;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(port, () => {
      console.log(`Localhost Running at http://localhost:${port}`);
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};

initializeDbAndServer();

//sample
app.get("/", async (req, res) => {
  try {
    const allTransactions = await db.all(
      `SELECT id, title,category, price FROM products`
    );
    res.json({ allTrans: allTransactions });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: err.message });
  }
});

//all?month=02
app.get("/all", async (req, res) => {
  const { month, search = "" } = req.query;
  const secureSearch = "%" + search + "%";
  try {
    const allTransactions = await db.all(
      `SELECT * FROM products
      WHERE CAST(strftime("%m", dateOfSale) AS integer)=${month}
      AND (title like '%${secureSearch}' OR description like '%${secureSearch}' )`
    );
    res.json({ allTrans: allTransactions });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: err.message });
  }
});

///statistics?month=04
app.get("/statistics", async (req, res) => {
  const { month } = req.query;

  try {
    const totalSaleAmountOSelectedMonth = await db.get(`
      SELECT SUM(price) AS totalSale
      FROM products
      WHERE strftime('%m', dateOfSale) ='${month}'
    `);

    const soldItemsOfMonth = await db.get(`
      SELECT count(*) AS totalSoldItems
      FROM products
      WHERE strftime('%m', dateOfSale)='${month}'
      AND sold = 1
    `);

    const notSoldItemsOfMonth = await db.get(`
      SELECT count(*) AS notSoldItems
      FROM products
      WHERE strftime('%m', dateOfSale)='${month}'
      AND sold = 0
    `);

    res.json({
      totalSale: totalSaleAmountOSelectedMonth.totalSale || 0,
      soldItems: soldItemsOfMonth.totalSoldItems || 0,
      notSoldItems: notSoldItemsOfMonth.notSoldItems || 0,
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

///barchart?month=04
app.get("/barchart", async (req, res) => {
  try {
    const { month } = req.query;

    const priceRanges = [
      { min: 0, max: 100 },
      { min: 101, max: 200 },
      { min: 201, max: 300 },
      { min: 301, max: 400 },
      { min: 401, max: 500 },
      { min: 501, max: 600 },
      { min: 601, max: 700 },
      { min: 701, max: 800 },
      { min: 801, max: 900 },
      { min: 901, max: Number.MAX_SAFE_INTEGER },
    ];

    const priceRangeCounts = [];
    for (const range of priceRanges) {
      const { min, max } = range;
      const countQuery = `
        SELECT COUNT(*) AS count
        FROM products
        WHERE CAST(strftime('%m', dateOfSale) AS INTEGER) = ${month}
        AND price BETWEEN ${min} AND ${max}
      `;

      const result = await db.get(countQuery);

      priceRangeCounts.push({
        priceRange: `${min}-${max > Number.MAX_SAFE_INTEGER ? "above" : max}`,
        count: result.count,
      });
    }
    res.json({ priceRangeCounts });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

///piechart?month=04
app.get("/piechart", async (req, res) => {
  const { month } = req.query;

  try {
    const categoryCountsQuery = `
      SELECT category, COUNT(*) AS itemCount
      FROM products
      WHERE strftime('%m', dateOfSale) = '${month}'
      GROUP BY category`;

    const categoryCounts = await db.all(categoryCountsQuery);

    const categories = categoryCounts.map((row) => ({
      categoryName: row.category,
      categoryCount: row.itemCount,
    }));

    res.json({ categoryCounts: categories });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

///combinedData?month=04
app.get("/combinedData", async (req, res) => {
  try {
    const statisticsPromise = axios.get("http://localhost:5004/statistics", {
      params: { month: req.query.month },
    });

    const barChartPromise = axios.get("http://localhost:5004/barchart", {
      params: { month: req.query.month },
    });

    const pieChartPromise = axios.get("http://localhost:5004/piechart", {
      params: { month: req.query.month },
    });

    const [statisticsResponse, barChartResponse, pieChartResponse] =
      await Promise.all([statisticsPromise, barChartPromise, pieChartPromise]);

    const combinedResponse = {
      statistics: statisticsResponse.data,
      barChart: barChartResponse.data,
      pieChart: pieChartResponse.data,
    };

    res.json(combinedResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});