# :package: Package Policy Action 

This GitHub action allows you to provide a list of packages allowed or prohibited along with versions to be enforced within this repository. If a code push or pull request contains changes to a `packages.json` manifest file and those changes reference a package that violates the package policy, a `violations` output value is set containing an array of the offending packages in JSON format.

Versions can be specified as:
* literal - `1.2.5`
* any version - `*`
* specific to major and/or minor - `1.2.*`

:bath: Versions are sanitized of any non-numeric characters (`^`, `~`, `v`) before comparison

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
        id: post-script
        with:
          github-token: ${{secrets.GITHUB_TOKEN}}
          violations: ${{steps.package-policy.outputs.violations}}
          script: |
            const script = require(`${process.env.GITHUB_WORKSPACE}/.github/workflows/package_violation.js`)
            await script({github})
```

Sample content of `package-policy-allow.json`
```json
{
    "applicationinsights": "1.0.8",
    "chokidar": "*",
    "graceful-fs": "*",
    "http-proxy-agent": "^2.1.*0*",
    "https-proxy-agent": "^2.2.3",
    "iconv-lite-umd": "~0.6.8",
    "jschardet": "*",
    "keytar": "*",
    "minimist": "^1.2.5",
    "native-is-elevated": "0.4.x",
    "native-keymap": "2.1.2",
    "native-watchdog": "1.3.0"
}
```

## :pencil: Configuration

The following inputs are required:

- `policy`: Provide either `allow` to treat the policy as an allow list or `prohibit` to treat it as a prohibit list
- `policy-url`: The remote URL of the policy.json file containing a list of packages and versions allowed or prohibited ([see sample payload](#sample-content-of-package-policy-allowjson))
- `fail-if-violations`: set to false if you want this action to refrain from setting the status of this action to **fail** - this allows downstream actions to run
- `github-token`: leave this be :metal: - needed to access the added or modified files


## :no_entry: Responding to Violations

Note that this action only checks to see if package violations are detected and writes that data to the `violations` output. In this sample,
we use a downstream action to respond to any violations that occur. By using the `actions/github-script@v2` action, we can execute
Javascript directly in the yaml workflow. Even cleaner, we can consolidate that logic in it's own file and call it from the yaml workflow.

```yaml
steps:
  ...
  - uses: actions/github-script@v2
    name: "Respond to package violations"
    id: post-script
    with:
      github-token: ${{secrets.GITHUB_TOKEN}}
      violations: ${{steps.package-policy.outputs.violations}}
      script: |
        const script = require(`${process.env.GITHUB_WORKSPACE}/.github/workflows/package_violation.js`)
        await script({github})
```

Here we are executing logic contained in the [.github/workflows/package_violation.js](.github/workflows/package_violation.js) file.
If a a violation occurs:
* triggered by code push
  * an issue will be created, labeled with `Package Violation`, containing a link to the commit, and assigned to the user pushing the code
* triggered by pull request being opened or updated
  * the pull request will be labeled with `Package Violation` and a comment is added with violation details

Keeping the response to the violations in a separate step but in a Javascript file allows for maximum flexibility on how
you choose to respond while still providing access to context, core, octokit and io.


## :boom: In Action

**A commit was made that included an update to the packages.json manifest file.**
![Action Console Log](assets/action_log.png?raw=true)

**Because a violation was detected, a comment is added to the pull request and labeled. If triggered by a code push, a new issue is created and assigned to the user who pushed the code.**
![Pull request commented on due to violation](assets/pull_request.png?raw=true)


### Limitations

* Only supports the one `package.json` manifest file currently
* Only supports Javascript and Typescript projects currently
* Only looks in the `dependencies` node in the `package.json` file

### Improvements

* support multiple package manifest files for repos with several projects
* provide support for other frameworks (.NET, Ruby, Java, Go)
* provide support for ignore path filters to allow ignoring specific package manifest files (i.e. backup, etc)

### License

MIT
