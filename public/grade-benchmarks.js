(function (global) {
  const GRADE_BENCHMARKS = [
    { grade: "K", readingSpeedMean: 11.52, readingSpeedStdDev: 1.97, vocabularyMean: 504.35, vocabularyStdDev: 86.63, lexileMean: 64.53, lexileStdDev: 61.35 },
    { grade: "1", readingSpeedMean: 52.46, readingSpeedStdDev: 7.98, vocabularyMean: 2476.89, vocabularyStdDev: 462.85, lexileMean: 248.98, lexileStdDev: 76.64 },
    { grade: "2", readingSpeedMean: 98.88, readingSpeedStdDev: 15.44, vocabularyMean: 4490.54, vocabularyStdDev: 812.47, lexileMean: 439.49, lexileStdDev: 78.35 },
    { grade: "3", readingSpeedMean: 111.92, readingSpeedStdDev: 17.37, vocabularyMean: 6938.49, vocabularyStdDev: 1312.43, lexileMean: 646.91, lexileStdDev: 84.21 },
    { grade: "4", readingSpeedMean: 134.49, readingSpeedStdDev: 19.48, vocabularyMean: 9021.31, vocabularyStdDev: 1620.25, lexileMean: 845.27, lexileStdDev: 77.97 },
    { grade: "5", readingSpeedMean: 144.6, readingSpeedStdDev: 21.5, vocabularyMean: 11775.32, vocabularyStdDev: 2175.14, lexileMean: 947.16, lexileStdDev: 78.34 },
    { grade: "6", readingSpeedMean: 156.64, readingSpeedStdDev: 24.21, vocabularyMean: 14951.18, vocabularyStdDev: 2630.46, lexileMean: 1054.09, lexileStdDev: 82.85 },
    { grade: "7", readingSpeedMean: 166.35, readingSpeedStdDev: 22.7, vocabularyMean: 17087.51, vocabularyStdDev: 3231.53, lexileMean: 1099.18, lexileStdDev: 83.55 },
    { grade: "8", readingSpeedMean: 177.3, readingSpeedStdDev: 25.6, vocabularyMean: 19882.64, vocabularyStdDev: 3422.78, lexileMean: 1151.07, lexileStdDev: 80.68 },
    { grade: "9", readingSpeedMean: 189.64, readingSpeedStdDev: 28.12, vocabularyMean: 22847.12, vocabularyStdDev: 4138.11, lexileMean: 1201.86, lexileStdDev: 81.95 },
    { grade: "10", readingSpeedMean: 205.2, readingSpeedStdDev: 29.93, vocabularyMean: 26966.74, vocabularyStdDev: 4976.31, lexileMean: 1251.06, lexileStdDev: 77.65 },
    { grade: "11", readingSpeedMean: 213.62, readingSpeedStdDev: 30.55, vocabularyMean: 32070.49, vocabularyStdDev: 5685.39, lexileMean: 1291.15, lexileStdDev: 74.8 },
    { grade: "12", readingSpeedMean: 224.74, readingSpeedStdDev: 32.76, vocabularyMean: 40544.06, vocabularyStdDev: 7285.15, lexileMean: 1347.59, lexileStdDev: 77.38 }
  ];

  const READING_SUGGESTIONS = {
    K: ["Decodable picture books", "Rhyming stories", "Alphabet and sight-word readers"],
    "1": ["Early-reader books", "Animal fact books with short sentences", "Folk tales with repeated phrases"],
    "2": ["Short chapter books", "Grade 2 science readers", "Biographies written for young readers"],
    "3": ["Longer chapter books", "Mythology retellings", "History and science articles for kids"],
    "4": ["Adventure novels", "Narrative nonfiction", "Magazine articles about science and history"],
    "5": ["Middle-grade novels", "Primary-source history excerpts with support", "Long-form science explainers"],
    "6": ["Contemporary middle-grade fiction", "Argument essays for students", "Accessible biographies"],
    "7": ["Young adult novels", "Current-events articles", "Introductory literary analysis passages"],
    "8": ["Classic short stories", "Editorials with evidence", "Science and social-studies textbook chapters"],
    "9": ["High-school literature", "Narrative nonfiction essays", "Foundational civics and science texts"],
    "10": ["Literary novels", "Historical speeches", "Research-based feature articles"],
    "11": ["American and world literature", "Opinion essays from reputable publications", "College-prep nonfiction"],
    "12": ["College-ready essays", "Complex literary works", "Long-form journalism and academic introductions"]
  };

  const api = { GRADE_BENCHMARKS, READING_SUGGESTIONS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.GradeBenchmarks = api;
})(typeof window !== "undefined" ? window : globalThis);
