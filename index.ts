import * as Enumerable from 'linq';
import { generate } from 'linq';
const newman = require('newman');
const config = require("./scenarios.json");
//const js2xmlparser = require("js2xmlparser");
const Handlebars = require("handlebars");
const cheerio = require("cheerio");
const fs = require("fs");
const scenariosArr = [];
const tagsArr = [];
let environment = null;
//Ashish
const reports = {
  xmlURLs: [],
  htmlURLs: []
};
const sourcingReport = {
  scenarios: []
};
//const sourcingReport = require("./reports/test.json");
process.env.projectDirectory = "./sourcing/rfx";

// Env variable for Environment, Product Module and Domain
process.env.environment = "qc";
process.env.product = "sourcing";
process.env.domain = "ascena";
// Env variable for Environment, Product Module and Domain

const productConfig = config[process.env.product];

// Handelbar helpers
Handlebars.registerHelper("inc", function(value, options) {
  return parseInt(value) + 1;
});

// Report Object Variables 
let collectionsCount = 0;
let currentScenarioReport = {};
let currentCollection = {};
let currentCollectionCount = 0;

// Get environment
environment = process.env.environment;

executeScenarios(productConfig);
//generateScenariosReport();

// Execute List of Scenarios
function executeScenarios(productConfig) {
    let collections = [];
    Enumerable.from(productConfig.scenarios).forEach((scenario, index) => {
        //console.log("scenario:" + scenario.key + "()");
        Enumerable.from(scenario.value.templates).forEach((template, index) => {
            let templateCollections = [];
            templateCollections = executeTemplate(template, scenario.value.name, scenario.value.code,  productConfig);
            collections.push(...templateCollections);
        });
    });

    collectionsCount = collections.length;
    executeCollection(collections, 0, productConfig, undefined);
}

function executeTemplate(scenarioTemplate, scenarioName, scenarioCode, productConfig) {
    var template = Object.assign({}, productConfig.template[scenarioTemplate.collection]);
    var collections = [];
    if (template.pre && template.pre.length > 0) {
        //console.log("template:" + templateName + ".pre()");
        Enumerable.from(template.pre).forEach((preScript: any, index) => {
            //console.log("actor:" + preScript.actor + " collection." + preScript.collection + "()");
            let collection = Object.assign({}, preScript);
            collection.isPre = true;
            collection.actor = preScript.actor;
            collection.templateName = scenarioTemplate.collection;
            collection.scenarioName = scenarioName;
            collection.scenarioCode = scenarioCode;
            collection.data = scenarioTemplate.data;
            collections.push(collection);
        });
    }
    //console.log("template:" + templateName + "()");
    let collection: any = {};
    collection.collectionName = scenarioTemplate.collection;
    collection.actor = scenarioTemplate.actor;
    collection.templateName = scenarioTemplate.collection;
    collection.scenarioName = scenarioName;
    collection.scenarioCode = scenarioCode;
    collection.data = scenarioTemplate.data;
    collections.push(collection);

    if (template.post && template.post.length > 0) {
        //console.log("scenario:" + templateName + ".post()");
        Enumerable.from(template.post).forEach((postScript: any, index) => {
            //console.log("actor:" + postScript.actor + " collection." + postScript.collection + "()");
            let collection = postScript;
            collection.isPost = true;
            collection.actor = postScript.actor;
            collection.templateName = scenarioTemplate.collection;
            collection.scenarioName = scenarioName;
            collection.scenarioCode = scenarioCode;
            collection.data = scenarioTemplate.data;
            collections.push(collection);
        });
    }
    
    return collections;
}

function executeCollection(collections, index, productConfig, prevCollectionPM) {
    let obj = {
        collection: require(process.env.projectDirectory + productConfig.collection[collections[index].collectionName]),
        environment: require(process.env.projectDirectory + productConfig.environment[environment][process.env.domain][collections[index].actor]),
        reporters: ["cli", "junit", "html"],
        reporter : { 
            junit : { export : './reports/scenarios/'+ collections[index].scenarioCode + '-' + collections[index].collectionName +'.xml' }, 
            html: { export: './reports/scenarios/'+ collections[index].scenarioCode + '-' + collections[index].collectionName +'.html'} 
        }
    };
    console.log("================================================");
    console.log("scenario:" + collections[index].scenarioName);
    console.log("template:" + collections[index].templateName);
    if (collections[index].isPre)
        console.log("pre");
    if (collections[index].isPost)
        console.log("post");
    console.log("collection:" + collections[index].collectionName);
    
    if (collections[index].actor)
        console.log("actor:" + collections[index].actor);

    if (prevCollectionPM) obj["globals"] = prevCollectionPM.globals;
    
    // To Add Dynamic data for the suite(Team member & Supplier)
    if(collections[index].data)
        obj["iterationData"] = require(process.env.projectDirectory + productConfig.data[environment][process.env.domain][collections[index].data]);

    newman.run(obj, (err, summary) => {
        // Generate Report Object
        generateScenariosReportObj(collections[index], summary);
        if (err) throw err;
        index++;        
        if (index >= collections.length) {
            generateScenariosReport();           
            return;
        };              
        executeCollection(collections, index, productConfig, summary);
    });    
}

// Generate Scenarios Report Object
function generateScenariosReportObj(collection, summary){
    const fileName = collection.scenarioCode + "-" + collection.collectionName;
    currentCollectionCount++;

    if (Object.keys(currentScenarioReport).length === 0 && currentScenarioReport.constructor === Object) {
        currentScenarioReport["scenarioName"] = collection.scenarioName;
        currentScenarioReport["collections"] = [];
        currentScenarioReport["scenarioCode"] = collection.scenarioCode;
    }
    else if(currentScenarioReport["scenarioName"] && (currentScenarioReport["scenarioName"] !== collection.scenarioName)){
        sourcingReport.scenarios.push(currentScenarioReport);
        currentScenarioReport = {};
        currentScenarioReport["scenarioName"] = collection.scenarioName;
        currentScenarioReport["collections"] = [];
        currentScenarioReport["scenarioCode"] = collection.scenarioCode;
    }
    
    if(currentScenarioReport["scenarioName"] && (currentScenarioReport["scenarioName"] === collection.scenarioName)){
        currentCollection["collectionCode"] = collection.scenarioCode + "-" + collection.collectionName;
        currentCollection["collectionName"] = collection.collectionName;

        if(summary){
            currentCollection["executions"] = summary.run.executions;
            currentCollection["executionTime"] = 0;

            let apisPass = 0;
            let apisFail = 0;
            let apis = [];
            
            // Generate API's List
            summary.run.executions.forEach((execution) => {
                let api = {
                    name: null,
                    status: null,
                    pass: 0,
                    fail: 0
                }

                if(execution.response.responseTime)
                    currentCollection["executionTime"] = currentCollection["executionTime"] + execution.response.responseTime;

                if(execution.response.code >= 200 && execution.response.code < 400)
                    apisPass++;
                else if(execution.response.code >= 400)
                    apisFail++;

                api.name = execution.item.name;
                api.status = execution.response.code;

                if(execution.assertions){
                    execution.assertions.forEach((testCase) => {
                        if(testCase.hasOwnProperty("error") && testCase.error)
                            api.fail++;
                        else
                            api.pass++;
                    });
                }                

                apis.push(api);                
            });

            currentCollection["apisPass"] = apisPass;
            currentCollection["apisFail"] = apisFail;
            currentCollection["apis"] = apis;
        }   

        currentCollection["urls"] = {
            xml: 'http://gepmtstorage.blob.core.windows.net/sourcingreports/scenarios/' + fileName + '.xml',
            html: 'http://gepmtstorage.blob.core.windows.net/sourcingreports/scenarios/' + fileName + '.html'
        };
        currentScenarioReport["collections"].push(currentCollection);
        currentCollection = {};  
    }
    
    if(currentCollectionCount == collectionsCount)
        sourcingReport.scenarios.push(currentScenarioReport);
}

// Generate Reports List
function generateScenariosReport() {
    fs.readFile("./reports/template.html", "utf8", function read(err, data) {
        if (err) {
            throw err;
        }

        const template = Handlebars.compile(data);
        
        const html = template(sourcingReport);

        fs.readFile("./reports/index.html", "utf8", function read(err, indexData) {
            const $ = cheerio.load(indexData);

            $("#sourcingReportsList").html(html);
            $("#date").html((new Date()).toUTCString());
            $('#domain').html(process.env.domain);

            fs.writeFile("./reports/index.html", $.html(), "utf8", function(err) {
              if (err) {
                return console.log(err);
              }

              console.log("The file was saved!");
            }); 
        });
      
    });
}

//newman run coll.json -e env.json -g globals.json --export-environment env.json --export-globals globals.json
/* newman run tests/integration-test/features/supplier-response-submit.postman_collection.json -e 
tests/integration-test/environment/supp-qc-env.postman_environment.json -g tests/integration-test/globals.json 
--export-globals tests/integration-test/globals.json */