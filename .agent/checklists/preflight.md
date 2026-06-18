# Preflight Checklist

- [ ] Run `git status --short`
- [ ] Confirm working tree has no unrelated user changes that would be overwritten
- [ ] Run `./scripts/preflight.sh`
- [ ] Confirm repository root contains `AGENTS.md`
- [ ] Confirm `COMMANDS.md` exists
- [ ] Confirm `.agent/PLANS.md` exists
- [ ] Confirm active ExecPlan exists
- [ ] Confirm package manager availability
- [ ] Confirm required scripts exist
- [ ] Confirm test harness exists or active plan creates it
- [ ] Confirm required secrets are not needed or configured
- [ ] Confirm local services are available or mocked
- [ ] Record known blockers
