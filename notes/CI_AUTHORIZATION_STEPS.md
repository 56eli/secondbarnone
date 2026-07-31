=== CI PATCH AUTHORIZATION STEPS ===
1. Reconnect/authorize GitHub with workflows permission (Arena App lacks it).
2. Apply patch: git apply notes/CI_V26_WORKFLOW.patch
3. Commit on arena/019fb73a-secondbarnone (session fixed to this branch).
4. Push: git push origin arena/019fb73a-secondbarnone
5. Open PR to crazy-branch.
6. Verify .github/workflows/check.yml contains lint/format/typecheck steps, single test run, asset budget gate, 300-seed simulation with fidelity warning.
