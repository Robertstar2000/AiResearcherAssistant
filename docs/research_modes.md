# Research Assistant Flow Logic and Mode Structures

## Processing Flow

1. **Initial Request** (0-10%)
   - User submits research topic
   - System validates input
   - Initializes progress tracking

2. **Outline Generation** (10-20%)
   - Generates detailed outline based on selected mode
   - Validates outline structure
   - Parses into section hierarchy

3. **Section Generation** (20-80%)
   - Sequential processing with 20-second intervals
   - Progress tracking per section
   - Error handling and rate limit management
   - Subsection integration

4. **Reference Compilation** (80-90%)
   - Generates comprehensive references
   - Validates and formats citations

5. **Final Assembly** (90-100%)
   - Combines all sections
   - Formats final document
   - Quality checks

## Research Modes and Section Structures

### 1. Article Mode
```
1. Abstract
   1.1. Research Objective
   1.2. Methodology Overview
   1.3. Key Findings
   1.4. Conclusions

2. Introduction
   2.1. Background
   2.2. Research Question
   2.3. Significance of Study

3. Literature Review
   3.1. Theoretical Framework
   3.2. Current Research
   3.3. Research Gap

4. Methodology
   4.1. Research Design
   4.2. Data Collection Methods
   4.3. Analysis Approach

5. Results
   5.1. Primary Findings
   5.2. Data Analysis
   5.3. Key Observations

6. Discussion
   6.1. Interpretation
   6.2. Implications
   6.3. Limitations

7. Conclusion
   7.1. Summary
   7.2. Future Research
   7.3. Recommendations

8. References
```

### 2. Literature Review Mode
```
1. Introduction
   1.1. Overview
   1.2. Research Questions
   1.3. Review Scope

2. Review Methodology
   2.1. Search Strategy
   2.2. Selection Criteria
   2.3. Analysis Method

3. Literature Analysis
   3.1. Historical Context
   3.2. Current Developments
   3.3. Key Themes

4. Findings Synthesis
   4.1. Major Findings
   4.2. Patterns and Trends
   4.3. Research Gaps

5. Discussion
   5.1. Implications
   5.2. Future Directions
   5.3. Recommendations

6. Conclusion
   6.1. Summary
   6.2. Research Agenda

7. References
```

### 3. General Research Mode
```
1. Overview
   1.1. Topic Introduction
   1.2. Key Concepts
   1.3. Significance

2. Background
   2.1. Historical Context
   2.2. Current Understanding
   2.3. Key Developments

3. Main Analysis
   3.1. Core Components
   3.2. Key Arguments
   3.3. Evidence Review

4. Discussion
   4.1. Key Insights
   4.2. Implications
   4.3. Future Considerations

5. Conclusion
   5.1. Summary
   5.2. Recommendations

6. References
```

## Processing Notes

- Each section is generated with a 20-second delay to manage API rate limits
- Progress updates show "Processing research" during generation
- Error handling includes retry logic for rate limits
- References are generated comprehensively at the end
- Each mode maintains academic standards while focusing on its specific purpose:
  - Article: Formal academic research structure
  - Literature Review: Comprehensive analysis of existing research
  - General Research: Flexible, topic-focused exploration
