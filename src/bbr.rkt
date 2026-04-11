#lang racket
;; bbr.rkt
;; AndrewJ 2020-11-07

;; -------------------------
(require racket/system
         threading
         graph
         graph-ext
         lens
         lens/data/struct
         data/maybe)

(provide (all-defined-out))

;; -------------------------
;; Utilities

;; adjacent-pairs :: List a -> List (a a)
;; e.g. (adjacent-pairs (range 4)) => '((0 1) (1 2) (2 3))
(define (adjacent-pairs lst)
  (cond [(not (list? lst)) '()]
        [(zero? (length lst)) lst]
        [else (map list
                   (take lst (sub1 (length lst)))
                   (drop lst 1))]))

;; -------------------------
;; Datatypes

(struct stop ())

;; -------------------------
;; Create the network

;; Add a line label to a given edge
;; add-line-label :: Stop -> Stop -> a -> void
(define (add-line-label! src dest label)
  (line-set! src dest (append (line src dest #:default '())
                              (list label)))
  (line-set! dest src (append (line dest src #:default '())
                              (list label))))

;; Add a line to the network
;; add-line! :: Graph -> List Symbol -> Void
(define (add-line! G label stops)
  (for ([link (adjacent-pairs stops)])
    (let ([s1 (first link)]
          [s2 (second link)])
      (add-edge! G s1 s2)
      (add-line-label! s1 s2 label))))

;; A line
(define line-a1 '(crescent federal-park dalgal spindler hogan-park booth))
(define line-a2 '(crescent federal-park tramsheds harold-park wigram hegarty st-james
                           colbourne burton blackwattle-bay))
(define line-a3 '(crescent federal-park tramsheds harold-park wigram hegarty st-james
                           colbourne burton fish-market))

;; B line
(define line-b1 '(broadway franklyn mitchell colbourne burton blackwattle-bay boathouse
                           cook bellevue-port bridgewater glebe-point rozelle-bay crescent))
(define line-b2 '(broadway franklyn mitchell colbourne burton blackwattle-bay boathouse
                           cook bellevue))

;; C line
(define line-c1 '(william-henry cowper stadium wentworth-park blackwattle-bay boathouse cook
                                bellevue-port bridgewater glebe-point rozelle-bay crescent))
(define line-c2 '(william-henry cowper stadium wentworth-park blackwattle-bay boathouse cook
                                bellevue-port bridgewater glebe-point rozelle-bay jubilee-oval))
(define line-c3 '(william-henry cowper stadium wentworth-park blackwattle-bay boathouse cook
                                bellevue-port bridgewater glebe-point rozelle-bay
                                tramsheds harold-park wigram))

(define bbr (unweighted-graph/undirected '()))

(define-edge-property bbr line)

(add-line! bbr 'a1 line-a1)
(add-line! bbr 'a2 line-a2)
(add-line! bbr 'a3 line-a3)
(add-line! bbr 'b1 line-b1)
(add-line! bbr 'b2 line-b2)
(add-line! bbr 'c1 line-c1)
(add-line! bbr 'c2 line-c2)
(add-line! bbr 'c3 line-c3)

;; -------------------------
;; Vertex properties

;; This property needs to be added after all the vertices have been created, so that
;; they all inherit the initial value.
(define-vertex-property bbr attr
  #:init (stop))

;; Make a custom lens using the manufactured accessors
(define attr-lens (make-lens attr attr-set!))

;; Set a field of a struct in a vertex property
;; Requires an eval to get around the hard-coding of the field name in `struct-lens`
(define (vertex-property-set! vertex field value)
  (let ([h (attr vertex)]
        [field-lens (eval `(struct-lens stop ,field))])
    (lens-set (lens-compose field-lens attr-lens) vertex value)))

;; -------------------------
;; Visualise the graph in a PNG file
;; write-graph :: g -> IO g
(define (write-graph G)
  (call-with-output-file "./graph.dot"
    #:exists 'replace
    (λ (out) (graphviz G #:output out)))
  (system "/usr/local/bin/fdp -Tpng -O ./graph.dot"))

;; -------------------------
;; Unit tests

(module+ test
  (require rackunit
           rackunit/text-ui)
  
  (define bbr-tests
    (test-suite
     "Unit tests"
     (check-equal? (+ 2 3) 5)

     #;(test-case
        "Test vertex properties"
        (let ([a (attr 'broadway)]
              [_ (vertex-property-set! 'broadway 'capacity 3)]
              [b (attr 'broadway)])
          (check-equal? (stop-capacity a) 1)
          (check-equal? (stop-capacity b) 3)))))

  (run-tests bbr-tests))

;; The End