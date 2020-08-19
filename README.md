# :package: Package Policy 

This GitHub action allows you to provide a list of packages allowed or prohibited along with versions to be enforced within this repository. If a code push or pull request contains changes to a `package.json` manifest file containing a reference to a package that violates the package policy, a `violations` output value is set containing an array of the offending packages in JSON format.

**Why enforce dependencies?**
* internal security analysis by SecOps
* licensing restrictions
* centralization around standard libraries


**Versions can be specified as:**
* literal - `1.2.5`
* any version - `*`
* specific to major and/or minor - `1.2.*`

:shower: Versions are sanitized of any non-numeric characters (`^`, `~`, `v`) before comparison

## :dart: Usage

Create a `.github/workflows/enforce-package-policy.yml` file:

```yaml
name: "Enforce Package Policy"
on:
  push:
  pull_request:
    types:
      - opened
      - edited
jobs:
  enforce-package-policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: rob-derosa/package-policy@v1
        name: "Check for package violations"
        id: package-policy
        with:
          policy: allow
          policy-url: "https://mycompanywebsite.com/security/allow_policy.json"
          fail-if-violations: false
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/github-script@v2
        name: "Respond to package violations"
        with:
          github-token: ${{secrets.GITHUB_TOKEN}}
          violations: ${{steps.package-policy.outputs.violations}}
          script: |
            const script = require(`${process.env.GITHUB_WORKSPACE}/.github/workflows/package_violation.js`)
            await script({github, context, core})
```

#### Sample content of `allow_policy.json`
```json
{
    "applicationinsights": "1.0.8",
    "chokidar": "*",
    "graceful-fs": "*",
    "http-proxy-agent": "^2.1.*",
    "https-proxy-agent": "^2.*",
    "iconv-lite-umd": "~0.6.8",
    "jschardet": "*",
    "keytar": "*",
    "minimist": "^1.2.5",
    "native-is-elevated": "0.4.x",
    "native-keymap": "2.1.2",
    "native-watchdog": "1.3.*"
}
```

## :pencil: Configuration

The following inputs are accepted:

- `policy`: Provide either `allow` to treat the policy as an allow list or `prohibit` to treat it as a prohibit list
- `policy-url`: The remote URL of the policy.json file containing a list of packages and versions allowed or prohibited ([see sample payload](#sample-content-of-allow_policyjson))
- `fail-if-violations`: set to false if you want this action to refrain from setting the status of this action to **fail** - this allows downstream actions to run
- `include-dev-dependencies`: set to true if you want to enforce policy against packages under the `devDependencies` node in the `package.json` manifest
- `github-token`: leave this be :metal: - needed to access the added or modified files


## :warning: Responding to Violations

Note that this action only checks to see if package violations are detected and writes that data to the `violations` output. In this sample,
we use a downstream action to respond to any violations that occur. By using the `actions/github-script@v2` action, we can execute
Javascript directly in the yaml workflow. Even cleaner, we can consolidate that logic in it's own file and call it from the yaml workflow.

```yaml
steps:
  ...
  - uses: actions/github-script@v2
    name: "Respond to package violations"
    with:
      github-token: ${{secrets.GITHUB_TOKEN}}
      violations: ${{steps.package-policy.outputs.violations}}
      script: |
        const script = require(`${process.env.GITHUB_WORKSPACE}/.github/workflows/package_violation.js`)
        await script({github, context, core})
```

Here we are executing logic contained in the [.github/workflows/package_violation.js](.github/workflows/package_violation.js) file.
If a a violation occurs:
* triggered by code push
  * an issue will be created, labeled with `Package Violation`, containing a link to the commit, and assigned to the user pushing the code
* triggered by pull request being opened or updated
  * the pull request will be labeled with `Package Violation` and a comment is added with violation details

Keeping the response to the violations in a separate step and that logic in its own Javascript file allows for maximum flexibility on how
you choose to respond while still providing access to context, core, octokit, io and keeping your yaml nice and tidy.


## :boom: In Action

**A commit was made that included an update to the package.json manifest file.**
![Action Console Log](assets/action_log.png?raw=true)

**Because a violation was detected, a comment is added to the pull request and labeled. If triggered by a code push, a new issue is created and assigned to the user who pushed the code.**
![Pull request commented on due to violation](assets/pull_request.png?raw=true)


### Limitations

* supports Javascript and Typescript projects currently

### Improvements

* provide support for other frameworks (.NET, Ruby, Java, Go)
* provide support for ignore path filters to allow ignoring specific package manifest files (i.e. backups)

### License

MIT