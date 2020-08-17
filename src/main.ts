import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import fs from "fs";
import * as ghf from "./github_files";
import compareVersions from "compare-versions";
import yaml from "js-yaml"

export interface Package {
  name: string;
  version: string;
}

async function run(): Promise<void> {
  try {
    //const args = process.argv.slice(2);
    // const policyType = args[0];
    // const policyUrl = args[1]
    // const gitHubToken = args[2];
    // const addedFiles = args[3];
    // const changedFiles = args[4];

    // let doc = yaml.safeLoad(fs.readFileSync("action.yml", "utf-8"));
    // console.log(doc);

    const policyType = core.getInput("policy", { required: true })
    const policyUrl = core.getInput("policy-url", { required: true })
    const gitHubToken = core.getInput("github-token", { required: true })
    const failIfViolations = core.getInput("fail-if-violations", { required: false }) == "true"
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

    commits = commits.filter((c: any) => ! c.parents || 1 === c.parents.length);

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

    let referencedPackages = new Array<Package>();
    let packagePolicyList = new Array<Package>();
    let packageViolations = new Array<Package>();

    //Look to see if the package.json manifest was updated or added
    let manifestFilePath;

    allFiles.forEach((file) => {
      if (file.endsWith("package.json")) {
        manifestFilePath = file;
        return;
      }
    });

    //No manifest updates - bye!
    if (!manifestFilePath) {
      console.log("No package updates detected.")
      return;
    }

    let content: any = fs.readFileSync(manifestFilePath, 'utf8');
    let parsed;

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
    } catch (error) {
      console.log(error);
      core.debug(error.message);
      core.setFailed("Unable to parse the package.json manifest file - please ensure it's formatted properly.")
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

    referencedPackages.forEach((referenced: Package) => {
      let match = packagePolicyList.find(policy => policy.name === referenced.name &&
        (policy.version === "*" || compareVersions(policy.version, referenced.version) == 0));

      if (policyType == "allow") {

        if (!match) {
          packageViolations.push(referenced);
        }

      } else if (policyType == "prohibit") {

        if (match) {
          packageViolations.push(referenced);
        }
      }
    });

    client.issues.createComment

    console.log("\nREFERENCED PACKAGE LIST");
    console.log("---------------------------");
    referencedPackages.forEach((item) => {
      console.log(`${item.name} - ${item.version}`);
    });

    console.log("\nPACKAGE POLICY LIST");
    console.log("---------------------------");
    packagePolicyList.forEach((item) => {
      console.log(`${item.name} - ${item.version}`);
    });

    if (packageViolations.length > 0) {
      console.log("\n");

      let failMessage = "!!! PACKAGE POLICY VIOLATIONS DETECTED !!!";
      if (failIfViolations) {
        core.setFailed(failMessage);
      } else {
        console.log(failMessage);
      }

      core.setOutput("violations", packageViolations);
    } else {
      console.log("\nAll pacakges referenced conform to the policy provided.");
    }

    packageViolations.forEach((item) => {
      console.log(`${item.name} - ${item.version}`);
    });
  } catch (error) {
    console.log(error);
    core.setFailed(error.message)
  }
}

run()