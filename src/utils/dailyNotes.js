export const formatDailyNoteTitle = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildDailyNoteContent = (date = new Date()) => {
  const longDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `# ${longDate}

## Morning Reflection
**Mood:** 
**Goals for today:**
- 
- 
- 

## Notes


## Evening Reflection
**What went well:**
- 

**What could be improved:**
- 

**Grateful for:**
- 

---
#journal
`;
};
