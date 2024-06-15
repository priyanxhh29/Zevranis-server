const express = require("express");
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv').config()
const {v2} = require('cloudinary');
const fs = require('fs')


const app = express();

app.use(express.json());
app.use(cors());
app.set("view engine","ejs");
app.set("v")

// Database Connection with mongoDB
mongoose.connect(process.env.MONGODB_URL);

// cloudinary setup
v2.config({
    cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
    api_key:process.env.CLOUDINARY_API_KEY,
    api_secret:process.env.CLOUDINARY_API_SECRET
})


const uploadOnCloudinary = async (localFilePath) =>{
    try {
        if(!localFilePath)return null;
        // upload the file on cloudinary
        const response = await v2.uploader.upload(localFilePath,{
            resource_type:"auto"
        })
        fs.unlinkSync(localFilePath);
        return response;        
    } catch (error) {
        fs.unlink(localFilePath);
        return null;
    }
}
// API creation 
app.get("/",(req,res)=>{
    res.send("Express App is Running");
});


//Image Storage Engine
const storage = multer.diskStorage({
    destination:'./upload/images/',
    filename:(req,file,cb)=>{
        return cb(null,`${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
});

const upload = multer({storage:storage});

// Creating Upload Endpoint for images 
app.use('/images', express.static('upload/images'))
app.post("/upload",upload.single('product'),async (req,res)=>{
    const fileLocalPath = req.file?.path;
    if(!fileLocalPath)
    {
        return res.status(400).json({success:false,errors:"file can`t be upload"})
    }

    const file = await uploadOnCloudinary(fileLocalPath);
    if(!file.url){
        return res.status(400).json({success:false,errors:"file can`t be upload"})
    }
    
    
    res.json({
        success:1,
        image_url:file.url
    })
})

// schema for creating products
const Product = mongoose.model("product",{
    id:{
        type:Number,
        required:true,        
    },
    name:{
        type:String,
        required:true,
    },
    image:{
        type:String,
        required:true,
    },
    category:{
        type:String,
        required:true,
    },
    new_price:{
        type:Number,
        required:true,        
    },
    old_price:{
        type:Number,
        required:true,        
    },
    date:{
        type:Date,
        default:Date.now,
    },
    available:{
        type:Boolean,
        default:true,
    },
});


app.post('/addproduct', async(req,res)=>{
    let products = await Product.find({});
    let id;
    if(products.length>0){
        let last_product_array = products.slice(-1);
        let last_product = last_product_array[0];
        id = last_product.id+1;
    }else{
        id = 1;
    }
    const product = new Product({
        id:id,
        name:req.body.name,
        image:req.body.image,
        category:req.body.category,
        new_price:req.body.new_price,
        old_price:req.body.old_price,
    });
    console.log(product);
    await product.save();
    console.log("Saved");
    res.json({
        success:true,
        name:req.body.name,
    })
})


// creating api for deleting product

app.post('/removeproduct',async(req,res)=>{
    await Product.findOneAndDelete({
        id:req.body.id
    });
    console.log("Removed");
    res.json({
        success:true,
        name:req.body.name
    })
})


// Creating API for getting all products
app.get("/allproducts",async(req,res)=>{
        let products = await Product.find({});
        console.log("All Product Fetched");
        res.send(products);
})


// schema creating for user model 
const Users = mongoose.model('User',{
    name:{
        type:String,
    },
    email:{
        type:String,
        unique:true,
    },
    password:{
        type:String,
    },
    cartData:{
        type:Object,
    },
    date:{
        type:Date,
        default:Date.now,
    }
})

// creating endpoint for registering the user 
app.post('/signup' , async(req,res)=>{
    let check = await Users.findOne({email:req.body.email});
    if(check){
        return res.status(400).json({success:false,errors:"existing user found with same email address"})
    }
    let cart = {};
    for(let i=0;i<300;i++)cart[i]=0;
    const user = new Users({
        name:req.body.username,
        email:req.body.email,
        password:req.body.password,
        cartData:cart,
    });
    await user.save();
    const data = {
        user:{
            id:user.id
        }
    }
    const token = jwt.sign(data,process.env.SECRET_KEY);
    res.json({success:true,token})
})

// creating endpoint for user login 
app.post('/login',async(req,res)=>{
    let user = await Users.findOne({email:req.body.email});
    if(user){
        const passCompare = req.body.password === user.password;
        if(passCompare){
            const data = {
                user:{
                    id:user.id
                }
            }
            const token = jwt.sign(data,process.env.SECRET_KEY);
            res.json({success:true,token});
        }
        else{
            res.json({success:false,errors:"Wrong Password"})
        }
    }else{
        res.json({
            success:false,
            errors:"Wrong Email Id"
        })
    }
})

// creating endpoint for new Collection datat 
app.get('/newCollections',async(req,res)=>{
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    res.send(newcollection);
})

// creating end point for popular in women section 
app.get('/popularinwomen',async(req,res)=>{
    let products = await Product.find({category:'women'})
    let popular_in_women = products.slice(0,4);
    res.send(popular_in_women);
})

//creating middleware to fetch user 
const fetchUser = async (req,res,next)=>{
    const token = req.header('auth-token');
    if(!token){
        res.status(401).send({
            errrors:"please authenticate using valid token"
        })
    }else{
        try{
            const data = jwt.verify(token,'secret_Zevranis');
            req.user = data.user;
            next();
        }catch(error){
            res.status(401).send({errors:'please authenticate using valid token'})
        }
    }
} 



// creating endpoint for adding products in cartData
app.post('/addtocart',fetchUser,async(req,res)=>{
    let userData = await Users.findOne({_id:req.user.id});
    userData.cartData[req.body.itemId]+=1;
     await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData});
     res.send('Added');
})

// creating endpoint to remove product from cartdata
app.post('/removefromcart',fetchUser,async(req,res)=>{
    let userData = await Users.findOne({_id:req.user.id});
    if(userData.cartData[req.body.itemId] > 0){
    userData.cartData[req.body.itemId]-=1;
    }
     await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData});
     res.send('Removed');
})

// creating endpoint to get cartdata
app.post('/getcart',fetchUser,async(req,res)=>{
        let userData = await Users.findOne({
            _id:req.user.id
        })
        res.json(userData.cartData);
})


app.listen(process.env.PORT,(error)=>{
    if(!error){
        console.log("Server Running on Port "+ process.env.PORT);
    }else {
        console.log("Error :"+error);
    }
});
