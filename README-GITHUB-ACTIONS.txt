4ppst0r3 — build an unsigned IPA with GitHub Actions

1. Create a GitHub repository. Public is the simplest option for using GitHub-hosted runners without private-repository minute limits; remember that public repositories expose their source code.
2. Upload the CONTENTS of this project folder to the repository root (the .xcodeproj folder, the 4ppst0r3 folder, and the .github folder). Do not upload the outer 4ppst0r3-iOS folder as an extra nested level.
3. Open the repository's Actions tab. If GitHub asks, enable Actions for the repository.
4. Choose “Build 4ppst0r3 IPA” in the left sidebar and press “Run workflow”. A push to main also starts a build automatically.
5. Wait for the run to finish successfully. Open the completed run and find “Artifacts” near the bottom.
6. Download and unzip “4ppst0r3-unsigned-ipa”. It contains 4ppst0r3.ipa.
7. Transfer the IPA to your iPhone and import it into LiveContainer.

This workflow creates an UNSIGNED IPA. It is intended for importing into LiveContainer, which handles app installation/signing in its own workflow. It is not a normally signed IPA for direct installation from Files or Apple Configurator. If LiveContainer rejects it, check its current import/signing requirements before changing the build.

No Mac is needed on your side: GitHub's macOS runner performs the Xcode build in the cloud. Your PC can be turned off after the workflow has been started; the cloud job continues independently.
