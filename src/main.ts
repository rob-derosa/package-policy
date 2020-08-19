import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import fs from "fs";
import * as ghf from "./github_files";
import compareVersions from "compare-versions";
import path from "path";


export interface PackageManifest {
  filePath: string;
  packages: Array<Package>
}

export interface Package {
  name: string;
  version: string;
}

async function run(): Promise<void> {
  try {
    const line = "-------------------------------------------";
    //const args = process.argv.slice(2);
    // const policyType = args[0];
    // const policyUrl = args[1]
    // const gitHubToken = args[2];
    //const failIfViolations = false;

    const policyType = core.getInput("policy", { required: true })
    const policyUrl = core.getInput("policy-url", { required: true })
    const gitHubToken = core.getInput("github-token", { required: true })
    const failIfViolations = core.getInput("fail-if-violations", { required: false }) == "true"
    const includeDevDependencies = core.getInput("include-dev-dependencies", { required: false }) == "true"
    const client = github.getOctokit(gitHubToken);

    //get all the modified or added files in the commits
    let allFiles: string[] = [];
    let commits;

    switch (github.context.eventName) {
      case "pull_request":
        let url = github.context.payload.pull_request?.commits_url;
        const args = { owner: github.context.repo.owner, repo: github.context.repo.repo };
        commits = await client.paginate(`GET ${url}`, args);
        break;
      case "push":
        commits = github.context.payload.commits.filter((c: any) => c.distinct);
        break;
      default:
        commits = [];
    }

    commits = commits.filter((c: any) => !c.parents || 1 === c.parents.length);

    for (let index = 0; index < commits.length; index++) {
      var f = await ghf.getFilesInCommit(commits[index], core.getInput('github-token'));
      allFiles = allFiles.concat(f);
    }

    // console.log("FILES ADDED or MODIFIED")
    // allFiles.forEach((f: string) => {
    //   console.log(f);
    // });

    if (!policyType || (policyType != "allow" && policyType != "prohibit"))
      throw new Error("policy must be set to 'allow' or 'prohibit'");

    if (!policyUrl)
      throw new Error("policy-url not set");

    let packagePolicyList = new Array<Package>();
    let packageViolations = new Array<PackageManifest>();

    //Look to see if the package.json manifest was updated or added
    let manifests = new Array<PackageManifest>();

    allFiles.forEach((file) => {
      var p = path.parse(file.toLowerCase());
      //console.log(p);
      if (p.base == "package.json") {
        manifests.push({ filePath: file.toLowerCase(), packages: new Array<Package>() });
      }
    });

    //No manifest updates - bye!
    if (manifests.length == 0) {
      console.log("No package updates detected.")
      return;
    }

    //Load up the remote policy list
    await fetch(policyUrl)
      .then(function (response) {
        return response.json();
      })
      .then(function (json) {
        Object.entries(json).forEach(([key, value]) => {
          let val = value as string;
          if (val.startsWith("^") || val.startsWith("~")) {
            val = val.substring(1);
          }

          packagePolicyList.push({
            name: key,
            version: val
          });
        });
      });

    console.log("\nPACKAGE POLICY LIST");
    console.log("---------------------------");
    packagePolicyList.forEach((item) => {
      console.log(`${item.name} - ${item.version}`);
    });

    //iterate through all the manifest files found
    manifests.forEach(pm => {

      console.log(`\nEvaluating '${pm.filePath}'`);
      console.log(line);

      let violation: PackageManifest = { filePath: pm.filePath, packages: Array<Package>() };
      let content: any = fs.readFileSync(pm.filePath, 'utf8');
      let parsed;
      let referencedPackages = new Array<Package>();

      try {
        parsed = JSON.parse(content);

        //Load up the referenced dependencies
        Object.entries(parsed.dependencies).forEach(([key, value]) => {
          let val = value as string;
          if (val.startsWith("^") || val.startsWith("~")) {
            val = val.substring(1);
          }

          referencedPackages.push({
            name: key,
            version: val
          });
        });

        if(includeDevDependencies) {
          Object.entries(parsed.devDependencies).forEach(([key, value]) => {
            let val = value as string;
            if (val.startsWith("^") || val.startsWith("~")) {
              val = val.substring(1);
            }
  
            referencedPackages.push({
              name: key,
              version: val
            });
          });  
        }

      } catch (error) {
        console.log(error);
        core.debug(error.message);
        core.setFailed("Unable to parse the package.json manifest file - please ensure it's formatted properly.")
      }

      referencedPackages.forEach((referenced: Package) => {
        let match = packagePolicyList.find(policy => policy.name === referenced.name &&
          (policy.version === "*" || compareVersions(policy.version, referenced.version) == 0));

        if (policyType == "allow") {

          if (!match) {
            violation.packages.push(referenced);
          }

        } else if (policyType == "prohibit") {

          if (match) {
            violation.packages.push(referenced);
          }
        }
      });

      if (violation.packages.length > 0) {
        packageViolations.push(violation);
      } else {
        console.log("\nNo violations detected");
      }
    });

    if (packageViolations.length > 0) {
      core.setOutput("violations", packageViolations);
      console.log("\n!!! PACKAGE POLICY VIOLATIONS DETECTED !!!");
      console.log(line);

      packageViolations.forEach(pm => {
        console.log(`Package Manifest: ${pm.filePath}`);

        pm.packages.forEach(pk => {
          console.log(` - ${pk.name} : ${pk.version}`);
        });

        console.log();
      });

      if (failIfViolations) {
        core.setFailed("!!! PACKAGE POLICY VIOLATIONS DETECTED !!!");
      }
    } else {
      console.log("\nAll package manifest files reference packages that conform to the policy provided.");
    }
  } catch (error) {
    console.log(error);
    core.setFailed(error.message)
  }
}

run()