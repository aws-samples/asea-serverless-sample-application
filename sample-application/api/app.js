/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

//Require module
const express = require('express');
// Express Initialize
const app = express();
// Database
const db = require('./queries');

const port = 5000;
app.listen(port,()=> {
console.log('listen port 5000');
});

//create api
app.get('/api/hello', (req,res)=>{
    const via = req.get("via") || "";
    res.send(JSON.stringify({
        message: `Bonjour!`,
        source: via.includes("CloudFront") ? "CloudFront" : "ALB de périmètre"
    }));
});

//create healthcheck
app.get('/healthcheck', (req,res)=>{
    res.send(JSON.stringify({
        message: "OK"
    }));
});

//simple query to database
app.get('/api/pgtest', db.testConnection);

