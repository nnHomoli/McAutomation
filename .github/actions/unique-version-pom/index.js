const xml2js = require('xml2js');
const fs = require('fs');

async function main() {
    const project_properties = fs.readFileSync("pom.xml")
    const parser = new xml2js.Parser();
    parser.parseString(project_properties, function (err, result) {
        if(err) {
            console.log(err);
        }
        const newVersion = result.project.version[0] + "." + process.env.GITHUB_RUN_NUMBER + "." + process.env.GITHUB_RUN_ATTEMPT;
        console.log("Applying new unique version from " + result.project.version[0] + " to " + newVersion);
        result.project.version[0] = newVersion

        const builder = new xml2js.Builder();
        const xml = builder.buildObject(result);
        fs.writeFileSync("pom.xml", xml);
    });
}

if(process.argv[2] !== undefined && fs.existsSync(process.argv[2])) {
    console.log("Changing working directory to " + process.argv[2])
    process.chdir(process.argv[2])
}
main()