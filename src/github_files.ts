import * as github from '@actions/github'

export async function getFilesInCommit(commit: any, token: string): Promise<string[]> {
    
    const repo = github.context.payload.repository;
    const owner = repo?.owner;
    const allFiles: string[] = [];

    const args: any = { owner: owner?.name || owner?.login, repo: repo?.name };
    args.ref = commit.id || commit.sha;
    
    const client = github.getOctokit(token);
    const result = await client.repos.getCommit(args);

    if (result && result.data) {
        const files = result.data.files;

        // files.forEach(element => {
        //     console.log(element);
        //     console.log(element.status);
        // });

        files
            .filter(file => file.status == "modified" || file.status == "added")
            .map(file => file.filename)
            .forEach(filename => allFiles.push(filename));
    }

    return allFiles;
}