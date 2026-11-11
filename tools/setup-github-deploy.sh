#!/bin/bash
# One-time setup: let GitHub Actions in norat18/healthspan-tracker deploy to Firebase without any stored key.
# Creates a deploy-only service account and a Workload Identity Federation pool that trusts ONLY this repository.
set -euo pipefail
G=${GCLOUD:-gcloud}
P=healthspan-tracker-app
PN=1088186330776
REPO=norat18/healthspan-tracker
SA=github-deploy@$P.iam.gserviceaccount.com

echo "1/5 Turning on the Google APIs this needs…"
$G services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  cloudresourcemanager.googleapis.com firebaserules.googleapis.com firebasehosting.googleapis.com --project $P

echo "2/5 Creating the deploy-only account…"
$G iam service-accounts describe $SA --project $P >/dev/null 2>&1 || \
  $G iam service-accounts create github-deploy --display-name="GitHub deploy (Healthspan Tracker)" --project $P

echo "3/5 Allowing it to publish the site and security rules (nothing else)…"
# A brand-new account can take a minute to be visible everywhere in Google Cloud, so retry each grant.
retry() { for i in 1 2 3 4 5 6 7 8; do "$@" >/dev/null 2>&1 && return 0; echo "   …waiting for Google Cloud to catch up ($i)"; sleep 15; done; "$@"; }
for R in roles/firebasehosting.admin roles/firebaserules.admin roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  retry $G projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role="$R" --condition=None --quiet
  echo "   granted $R"
done

echo "4/5 Trusting GitHub Actions from $REPO only…"
$G iam workload-identity-pools describe github --location=global --project $P >/dev/null 2>&1 || \
  $G iam workload-identity-pools create github --location=global --display-name="GitHub Actions" --project $P
$G iam workload-identity-pools providers describe healthspan-tracker --workload-identity-pool=github --location=global --project $P >/dev/null 2>&1 || \
  $G iam workload-identity-pools providers create-oidc healthspan-tracker --workload-identity-pool=github --location=global --project $P \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"

echo "5/5 Letting that repository act as the deploy account…"
retry $G iam service-accounts add-iam-policy-binding $SA --project $P --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

echo
echo "Done. GitHub Actions in $REPO (main branch only) can now deploy Healthspan Tracker."
