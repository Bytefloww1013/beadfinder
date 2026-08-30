# Graph shape (0.2)

Destination epic stays open until the destination is done.

Each slice is a child epic. Prefer `--parent <destination>` when creating slices. Ready queries for workers use the slice id.

Independent builds are parallel. Review waits on the builds that produce the diff.
