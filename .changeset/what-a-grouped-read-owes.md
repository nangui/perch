---
"@perchjs/testing": minor
---

Ask an adapter what a grouped read means. The question with teeth is an identity: every group's size added together is the number of rows there are. An adapter sizing a group by the rows a caller already holds passes every other check in this contract and fails that one, and so does an adapter that drops the group of rows holding nothing, which would be a list quietly shorter than it says it is.

It also asks that rows sharing a value are one group, narrowed to that value rather than counted across the table, because a suite that assumes it owns the table measures its neighbours. That a clause reaches the read and the sizes follow it rather than the whole table. That no rows is no groups. That a marked row is out of a group while it is out of a page. And that a column a grouped read refuses is refused rather than answered with a group per row.

Nothing is declared for any of it: which column can gather anything comes from `auditGroupKey`, the one rule, rather than from a list restated here. Where a model is tied on a column a grouped read refuses, a timestamp for instance, the checks needing a key skip rather than report every conforming adapter as raising.

What it still does not ask, and the header says so: that the rows holding nothing in a column are a group, unless the model happens to carry a nullable column a database will group. There has to be such a column to ask about and a contract cannot add one.
