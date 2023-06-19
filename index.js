const express = require("express");
const app = express();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cors = require("cors");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require("nodemailer");
const mg = require('nodemailer-mailgun-transport');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

const router = express.Router();

// middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));


// let transporter = nodemailer.createTransport({
//   host: 'smtp.sendgrid.net',
//   port: 587,
//   auth: {
//       user: "apikey",
//       pass: process.env.SENDGRID_API_KEY
//   }
// })

const auth = {
    auth: {
        api_key: process.env.EMAIL_PRIVATE_KEY,
        domain: process.env.EMAIL_DOMAIN
    }
}

const transporter = nodemailer.createTransport(mg(auth));

// send email confirmation
const sendPaymentConfirmationEmail = (payment) => {
  transporter.sendMail({
      from: "adittacse@gmail.com", // verified sender email
      to: payment.email, // recipient email
      subject: "Your Order is confirmed! Enjoy the food soon.", // Subject line
      text: "Hello world!", // plain text body
      html: `
          <div>
              <h2>Payment Confirmed!</h2>
              <p>Transaction Id: ${payment.transactionId}</p>
          </div>
      `, // html body
  }, function(error, info){
      if (error) {
          console.log(error);
      } else {
          console.log('Email sent: ' + info.response);
      }
  });
}

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "Unauthorized Access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gkaujxr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const cartCollection = client.db("bistroDB").collection("carts");
    const paymentCollection = client.db("bistroDB").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "10h" });
      res.send({ token });
    });

    // warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ error: true, message: "forbidden message" });
      }
      next();
    }

    // users related api's

    // step-2: get all users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // step-7: checking e user role admin or not
    // security layer: verifyJWT
    // email same
    // check admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // step-6: get specific user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // step-1: insert user name and email to mongodb
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist!" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // step-3: updating user role to admin
    app.patch("/users/user-to-admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // step-4: updating an user role from admin to general user
    app.patch("/users/admin-to-user/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "subscriber"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // step-5: delete an user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });



    // menu related api's

    // step-1: getting all menu items from mongodb to display in client side
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // // step-2: uploading new menu item to mongodb
    app.post("/menu", verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    });


    // step-2 : uploading product images to uploads folder
    // app.get('/uploads/:productId', (req, res) => {
    //     const { productId } = req.params;
    //     const productImagePath = path.join(__dirname, 'uploads', productId);
        
    //     fs.readdir(productImagePath, (err, files) => {
    //         if (err) {
    //             // console.error('Error reading product images:', err);
    //             return res.sendStatus(500);
    //         }
            
    //         if (files.length === 0) {
    //             console.log('No images found for the product');
    //             return res.sendStatus(404);
    //         }
            
    //         const productImage = files[0]; // Assuming the first image is the desired one
            
    //         const imagePath = path.join(productImagePath, productImage);
    //         res.sendFile(imagePath);
    //     });
    // });
    


    // Step 1: Set up multer storage and upload
    // multiple file upload
    // const storage = multer.diskStorage({
    //   destination: (req, file, cb) => {
    //     const productId = req.params.productId;
    //     const uploadDir = path.join(__dirname, 'uploads', productId);
    
    //     // Create the product directory if it doesn't exist
    //     if (!fs.existsSync(uploadDir)) {
    //       fs.mkdirSync(uploadDir, { recursive: true });
    //     }
    
    //     cb(null, uploadDir);
    //   },
    //   filename: (req, file, cb) => {
    //     const ext = path.extname(file.originalname);
    //     const filename = `${file.fieldname}-${Date.now()}${ext}`;
    //     cb(null, filename);
    //   },
    // });
    
    // const upload = multer({ storage });
    
    // // Step 2: Handle image upload
    // app.post('/upload/:productId', upload.array('image'), (req, res) => {
    //   const images = req.files.map((file) => file.filename);
    //   res.json({ success: true, images });
    // });

    // module.exports = app;




    // Step 3: Handle the route to insert the menu item into the database

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
        const newItem = req.body;
        const result = await menuCollection.insertOne(newItem);
        res.send(result);
    });


    // step-3: delete an item of menu
    app.delete("/menu/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // reviews related api's
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // cart collection

    // step-2: getting cart items from mongodb
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // step-1: inserting a cart item to mongodb from client side
    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    // step-3: delete a cart item
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"]
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      });
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
      const deleteResult = await cartCollection.deleteMany(query);

      // send an email confirming payment
      sendPaymentConfirmationEmail(payment);

      res.send({ insertResult, deleteResult });
    });

    // admin dashboard stats
    app.get("/admin-stats", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);

      res.send({
        revenue,
        users,
        products,
        orders
      });
    });

    // second best solution
    // aggregate pipeline
    // connecting two table data
    app.get("/order-stats", verifyJWT, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $addFields: {
            menuItemsIds: {
              $map: {
                input: "$menuItems",
                in: { $convert: { input: "$$this", to: "objectId" } }
              }
            }
          }
        },
        {
          $lookup: {
            from: "menu",
            localField: "menuItemsIds",
            foreignField: "_id",
            as: "menuItemsData",
          },
        },
        {
          $unwind: "$menuItemsData",
        },
        {
          $group: {
            _id: "$menuItemsData.category",
            count: { $sum: 1 },
            total: { $sum: "$menuItemsData.price" },
          },
        },
        {
          $project: {
            category: "$_id",
            count: 1,
            total: 1,
            _id: 0,
          },
        },
      ];

      try {
        const result = await paymentCollection.aggregate(pipeline).toArray();
        res.send(result); // Send the response as JSON
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("Bistro Boss is cooking!");
});

app.listen(port, () => {
  console.log(`Bistro Boss is cooking on port ${port}`);
});